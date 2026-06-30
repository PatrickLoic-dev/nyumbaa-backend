import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentOwnerOrPostOwnerGuard } from '../guards/comment-owner-or-post-owner.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';

const COMMENT_ID = 'comment-uuid';
const COMMENT_AUTHOR_ID = 'comment-author';
const POST_AUTHOR_ID = 'post-author';
const THIRD_PARTY_ID = 'third-party';

const mockComment = {
  id: COMMENT_ID,
  authorId: COMMENT_AUTHOR_ID,
  post: { authorId: POST_AUTHOR_ID },
};

const mockPrisma = {
  comment: { findUnique: jest.fn().mockResolvedValue(mockComment) },
};

function buildContext(userId: string, commentId = COMMENT_ID): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: { id: userId },
        params: { id: commentId },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('CommentOwnerOrPostOwnerGuard', () => {
  let guard: CommentOwnerOrPostOwnerGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentOwnerOrPostOwnerGuard,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    guard = module.get<CommentOwnerOrPostOwnerGuard>(CommentOwnerOrPostOwnerGuard);
    jest.clearAllMocks();
    mockPrisma.comment.findUnique.mockResolvedValue(mockComment);
  });

  it('allows the comment author to delete', async () => {
    await expect(guard.canActivate(buildContext(COMMENT_AUTHOR_ID))).resolves.toBe(true);
  });

  it('allows the post author to delete', async () => {
    await expect(guard.canActivate(buildContext(POST_AUTHOR_ID))).resolves.toBe(true);
  });

  it('throws 403 for a third party', async () => {
    await expect(guard.canActivate(buildContext(THIRD_PARTY_ID))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws 404 when comment does not exist', async () => {
    mockPrisma.comment.findUnique.mockResolvedValueOnce(null);
    await expect(guard.canActivate(buildContext(COMMENT_AUTHOR_ID))).rejects.toThrow(
      NotFoundException,
    );
  });
});
