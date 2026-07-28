import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const mockAdmin = {
  auth: {
    signUp: jest.fn(),
    signInWithPassword: jest.fn(),
    refreshSession: jest.fn(),
    resetPasswordForEmail: jest.fn(),
  },
};

const mockSupabaseService = {
  admin: mockAdmin,
  forUser: jest.fn().mockReturnValue({
    auth: { signOut: jest.fn().mockResolvedValue({ error: null }) },
  }),
};

const mockPrismaService = {
  profile: {
    upsert: jest.fn().mockResolvedValue({}),
  },
};

const mockUser = { id: 'user-uuid', email: 'test@example.com' };
const mockSession = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_at: 9999999999,
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('returns AuthResponse on success', async () => {
      mockAdmin.auth.signUp.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      const result = await service.register({
        email: 'test@example.com',
        password: 'Password123!',
        displayName: 'Test User',
      });

      if ('emailConfirmationRequired' in result) throw new Error('Unexpected email confirmation path');
      expect(result.user).toEqual(mockUser);
      expect(result.tokens.accessToken).toBe('access-token');
      expect(mockPrismaService.profile.upsert).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when email already exists', async () => {
      mockAdmin.auth.signUp.mockResolvedValue({
        data: {},
        error: { message: 'User already registered' },
      });

      await expect(
        service.register({ email: 'dup@example.com', password: 'Password123!', displayName: 'Dup' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns AuthResponse on valid credentials', async () => {
      mockAdmin.auth.signInWithPassword.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      const result = await service.login({ email: 'test@example.com', password: 'Password123!' });
      expect(result.tokens.refreshToken).toBe('refresh-token');
    });

    it('throws UnauthorizedException on invalid credentials', async () => {
      mockAdmin.auth.signInWithPassword.mockResolvedValue({
        data: {},
        error: { message: 'Invalid login credentials' },
      });

      await expect(
        service.login({ email: 'bad@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('calls signOut on the user-scoped client', async () => {
      await service.logout('jwt-token');
      expect(mockSupabaseService.forUser).toHaveBeenCalledWith('jwt-token');
    });
  });

  describe('refresh', () => {
    it('returns new tokens on valid refresh token', async () => {
      mockAdmin.auth.refreshSession.mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      });

      const result = await service.refresh({ refreshToken: 'valid-refresh' });
      expect(result.tokens.accessToken).toBe('access-token');
    });

    it('throws UnauthorizedException on expired refresh token', async () => {
      mockAdmin.auth.refreshSession.mockResolvedValue({
        data: {},
        error: { message: 'Token expired' },
      });

      await expect(service.refresh({ refreshToken: 'expired' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
