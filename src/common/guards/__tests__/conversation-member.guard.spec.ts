import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConversationMemberGuard } from '../conversation-member.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../supabase/supabase.service';

const RECIPIENT_ID = 'recipient-uuid';

const mockPrisma: Partial<PrismaService> = {
  profile: { findUnique: jest.fn() } as any,
};

const mockGetUserById = jest.fn();
const mockSupabase: Partial<SupabaseService> = {
  admin: { auth: { admin: { getUserById: mockGetUserById } } } as any,
};

function makeContext(id: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ params: { id } }),
    }),
  } as unknown as ExecutionContext;
}

describe('ConversationMemberGuard', () => {
  let guard: ConversationMemberGuard;

  beforeEach(() => {
    guard = new ConversationMemberGuard(
      mockPrisma as PrismaService,
      mockSupabase as SupabaseService,
    );
    jest.clearAllMocks();
  });

  it('throws 404 when the recipient profile does not exist', async () => {
    (mockPrisma.profile!.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(guard.canActivate(makeContext(RECIPIENT_ID))).rejects.toThrow(
      NotFoundException,
    );
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('throws 404 when the recipient has no Supabase auth account', async () => {
    (mockPrisma.profile!.findUnique as jest.Mock).mockResolvedValue({
      id: RECIPIENT_ID,
    });
    mockGetUserById.mockResolvedValue({
      data: { user: null },
      error: { message: 'not found' },
    });

    await expect(guard.canActivate(makeContext(RECIPIENT_ID))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws 403 when the recipient is currently banned', async () => {
    (mockPrisma.profile!.findUnique as jest.Mock).mockResolvedValue({
      id: RECIPIENT_ID,
    });
    const future = new Date(Date.now() + 60_000).toISOString();
    mockGetUserById.mockResolvedValue({
      data: { user: { id: RECIPIENT_ID, banned_until: future } },
      error: null,
    });

    await expect(guard.canActivate(makeContext(RECIPIENT_ID))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows the request when the recipient exists and is not banned', async () => {
    (mockPrisma.profile!.findUnique as jest.Mock).mockResolvedValue({
      id: RECIPIENT_ID,
    });
    mockGetUserById.mockResolvedValue({
      data: { user: { id: RECIPIENT_ID } },
      error: null,
    });

    await expect(guard.canActivate(makeContext(RECIPIENT_ID))).resolves.toBe(
      true,
    );
  });

  it('allows the request when a past banned_until has already expired', async () => {
    (mockPrisma.profile!.findUnique as jest.Mock).mockResolvedValue({
      id: RECIPIENT_ID,
    });
    const past = new Date(Date.now() - 60_000).toISOString();
    mockGetUserById.mockResolvedValue({
      data: { user: { id: RECIPIENT_ID, banned_until: past } },
      error: null,
    });

    await expect(guard.canActivate(makeContext(RECIPIENT_ID))).resolves.toBe(
      true,
    );
  });
});
