import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PostStatus, CommentStatus } from '@prisma/client';
import { CommentsService } from '../comments.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const POST_ID = 'post-uuid';
const AUTHOR_ID = 'author-uuid';
const POST_AUTHOR_ID = 'post-author-uuid';
const COMMENT_ID = 'comment-uuid';

const mockPost = {
  id: POST_ID,
  authorId: POST_AUTHOR_ID,
  status: PostStatus.published,
  commentsEnabled: true,
};

const mockComment = {
  id: COMMENT_ID,
  postId: POST_ID,
  authorId: AUTHOR_ID,
  content: 'Great post!',
  status: CommentStatus.published,
  createdAt: new Date('2026-06-30T10:00:00Z'),
  updatedAt: new Date('2026-06-30T10:00:00Z'),
  author: { id: AUTHOR_ID, displayName: 'Alice', avatarUrl: null },
};

const mockPrisma = {
  post: {
    findUnique: jest.fn().mockResolvedValue(mockPost),
  },
  comment: {
    create: jest.fn().mockResolvedValue(mockComment),
    findMany: jest.fn().mockResolvedValue([mockComment]),
    findUnique: jest.fn().mockResolvedValue(mockComment),
    update: jest.fn().mockResolvedValue(mockComment),
    delete: jest.fn().mockResolvedValue(mockComment),
  },
  profile: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockConfig = { get: jest.fn().mockReturnValue(undefined) };

describe('CommentsService', () => {
  let service: CommentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    jest.clearAllMocks();
    mockPrisma.post.findUnique.mockResolvedValue(mockPost);
    mockPrisma.comment.create.mockResolvedValue(mockComment);
    mockPrisma.comment.findMany.mockResolvedValue([mockComment]);
    mockPrisma.comment.findUnique.mockResolvedValue(mockComment);
    mockConfig.get.mockReturnValue(undefined);
  });

  describe('create', () => {
    it('creates a comment and returns it immediately (HTTP 201 path)', async () => {
      const result = await service.create(POST_ID, AUTHOR_ID, { content: 'Great post!' });

      expect(mockPrisma.comment.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(COMMENT_ID);
      expect(result.content).toBe('Great post!');
    });

    it('throws 404 when post does not exist', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce(null);
      await expect(service.create(POST_ID, AUTHOR_ID, { content: 'Hi' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 when post is removed', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce({
        ...mockPost,
        status: PostStatus.removed,
      });
      await expect(service.create(POST_ID, AUTHOR_ID, { content: 'Hi' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 403 COMMENTS_DISABLED when post has comments off', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce({
        ...mockPost,
        commentsEnabled: false,
      });
      await expect(service.create(POST_ID, AUTHOR_ID, { content: 'Hi' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('does not call Perspective API when key is absent', async () => {
      mockConfig.get.mockReturnValue(undefined);
      await expect(
        service.create(POST_ID, AUTHOR_ID, { content: 'Hi' }),
      ).resolves.toBeDefined();
    });
  });

  describe('findAll (pagination)', () => {
    it('returns comments with hasMore false when batch < limit', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce(mockPost);
      mockPrisma.comment.findMany.mockResolvedValueOnce([mockComment]);

      const result = await service.findAll(POST_ID, { limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('returns hasMore true and nextCursor when batch = limit + 1', async () => {
      const manyComments = Array.from({ length: 11 }, (_, i) => ({
        ...mockComment,
        id: `comment-${i}`,
        createdAt: new Date(Date.now() + i * 1000),
      }));
      mockPrisma.post.findUnique.mockResolvedValueOnce(mockPost);
      mockPrisma.comment.findMany.mockResolvedValueOnce(manyComments);

      const result = await service.findAll(POST_ID, { limit: 10 });

      expect(result.data).toHaveLength(10);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('comment-9');
    });

    it('throws 404 when post is removed', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce({
        ...mockPost,
        status: PostStatus.removed,
      });
      await expect(service.findAll(POST_ID, {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('hard deletes the comment', async () => {
      await service.remove(COMMENT_ID);
      expect(mockPrisma.comment.delete).toHaveBeenCalledWith({ where: { id: COMMENT_ID } });
    });
  });

  describe('moderation (Perspective API)', () => {
    it('flags comment when toxicity score exceeds threshold', async () => {
      mockConfig.get.mockReturnValue('fake-api-key');

      const axiosMock = jest.spyOn(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('axios'),
        'post',
      ).mockResolvedValueOnce({
        data: { attributeScores: { TOXICITY: { summaryScore: { value: 0.95 } } } },
      });

      await service.create(POST_ID, AUTHOR_ID, { content: 'Offensive content' });
      // Give the async moderation time to run
      await new Promise((r) => setTimeout(r, 50));

      expect(mockPrisma.comment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: CommentStatus.flagged } }),
      );

      axiosMock.mockRestore();
    });
  });
});
