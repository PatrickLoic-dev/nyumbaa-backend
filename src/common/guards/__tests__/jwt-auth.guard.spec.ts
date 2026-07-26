import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { RedisService } from '../../redis/redis.service';

const mockUser = { id: 'user-uuid', email: 'test@example.com' };

const mockAdminGetUser = jest.fn();
const mockSupabase: Partial<SupabaseService> = {
  admin: { auth: { getUser: mockAdminGetUser } } as any,
};

const mockRedis: Partial<RedisService> = {
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue(undefined),
};

function makeContext(authHeader?: string, metadata: Record<string, boolean> = {}): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: authHeader },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(mockSupabase as SupabaseService, mockRedis as RedisService, reflector);
    jest.clearAllMocks();
  });

  it('allows public routes without a token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(mockAdminGetUser).not.toHaveBeenCalled();
  });

  it('throws when no Authorization header is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const ctx = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('throws when the token is invalid', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockAdminGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } });
    const ctx = makeContext('Bearer bad-token');
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('attaches user to request on valid token', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockAdminGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    const request = { headers: { authorization: 'Bearer valid-token' } } as any;
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.user).toEqual(mockUser);
  });

  it('uses Redis cache and skips Supabase call on cache hit', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    mockAdminGetUser.mockResolvedValue({ data: { user: mockUser }, error: null });

    // First call: cache miss → Supabase called, result cached
    (mockRedis.get as jest.Mock).mockResolvedValueOnce(null);
    // Second call: cache hit → Supabase skipped
    (mockRedis.get as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockUser));

    const makeReq = () => ({ headers: { authorization: 'Bearer cached-token' } } as any);
    const makeCtx = (req: any) =>
      ({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => req }),
      }) as unknown as ExecutionContext;

    await guard.canActivate(makeCtx(makeReq()));
    await guard.canActivate(makeCtx(makeReq()));

    expect(mockAdminGetUser).toHaveBeenCalledTimes(1);
  });
});
