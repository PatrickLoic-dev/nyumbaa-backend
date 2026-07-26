import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { PostStatus } from '@prisma/client';
import { LikesService } from '../likes.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { LIKES_NOTIFY_QUEUE } from '../likes.constants';

const POST_ID = 'post-uuid';
const AUTHOR_ID = 'post-author-uuid';
const USER_ID = 'user-uuid';

const mockPost = { id: POST_ID, authorId: AUTHOR_ID, status: PostStatus.published };

const mockPrisma = {
  post: { findUnique: jest.fn().mockResolvedValue(mockPost) },
  like: {
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    count: jest.fn().mockResolvedValue(5),
  },
  $executeRaw: jest.fn().mockResolvedValue(1),
};

const mockRedis = {
  incr: jest.fn().mockResolvedValue(1),
  decr: jest.fn().mockResolvedValue(0),
  get: jest.fn().mockResolvedValue('1'),
  set: jest.fn().mockResolvedValue(undefined),
};

const mockQueue = { add: jest.fn().mockResolvedValue({}) };

describe('LikesService', () => {
  let service: LikesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LikesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        { provide: getQueueToken(LIKES_NOTIFY_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<LikesService>(LikesService);
    jest.clearAllMocks();
    mockPrisma.post.findUnique.mockResolvedValue(mockPost);
    mockPrisma.$executeRaw.mockResolvedValue(1);
    mockPrisma.like.count.mockResolvedValue(5);
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.decr.mockResolvedValue(0);
    mockQueue.add.mockResolvedValue({});
  });

  describe('like', () => {
    it('inserts like with ON CONFLICT DO NOTHING and returns liked: true', async () => {
      const result = await service.like(POST_ID, USER_ID);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockRedis.incr).toHaveBeenCalledWith(`post:${POST_ID}:likes_count`);
      expect(result).toEqual({ postId: POST_ID, liked: true, likesCount: 1 });
    });

    it('is idempotent — ON CONFLICT DO NOTHING means 10 rapid calls = 1 row (SQL mock called 10x, incr 10x)', async () => {
      const calls = Array.from({ length: 10 }, () => service.like(POST_ID, USER_ID));
      const results = await Promise.all(calls);

      // All calls succeed (idempotent HTTP 200)
      expect(results.every((r) => r.liked === true)).toBe(true);
      // SQL insert attempted each time (ON CONFLICT handles dedup at DB level)
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(10);
    });

    it('throws 404 when post does not exist', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce(null);
      await expect(service.like(POST_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('throws 404 when post is removed', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce({
        ...mockPost,
        status: PostStatus.removed,
      });
      await expect(service.like(POST_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });

    it('falls back to SQL count when Redis is unavailable', async () => {
      mockRedis.incr.mockResolvedValueOnce(null); // Redis KO

      const result = await service.like(POST_ID, USER_ID);

      expect(mockPrisma.like.count).toHaveBeenCalledWith({ where: { postId: POST_ID } });
      expect(result.likesCount).toBe(5);
    });

    it('does NOT enqueue notification when liker is the post author', async () => {
      await service.like(POST_ID, AUTHOR_ID); // self-like

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('enqueues notification with dedup jobId when liker is not the author', async () => {
      await service.like(POST_ID, USER_ID);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'notify-author',
        expect.objectContaining({ postId: POST_ID, postAuthorId: AUTHOR_ID }),
        expect.objectContaining({ jobId: `likes:notify:${POST_ID}` }),
      );
    });

    it('10 likes → 1 notification job (BullMQ dedup via jobId)', async () => {
      const calls = Array.from({ length: 10 }, () => service.like(POST_ID, USER_ID));
      await Promise.all(calls);

      // All 10 calls enqueue with the same jobId — BullMQ deduplicates at queue level
      const jobIds = mockQueue.add.mock.calls.map((c) => c[2].jobId);
      const unique = new Set(jobIds);
      expect(unique.size).toBe(1);
      expect(unique.has(`likes:notify:${POST_ID}`)).toBe(true);
    });
  });

  describe('unlike', () => {
    it('deletes the like and returns liked: false', async () => {
      const result = await service.unlike(POST_ID, USER_ID);

      expect(mockPrisma.like.deleteMany).toHaveBeenCalledWith({
        where: { postId: POST_ID, userId: USER_ID },
      });
      expect(mockRedis.decr).toHaveBeenCalledWith(`post:${POST_ID}:likes_count`);
      expect(result).toEqual({ postId: POST_ID, liked: false, likesCount: 0 });
    });

    it('falls back to SQL count when Redis is unavailable', async () => {
      mockRedis.decr.mockResolvedValueOnce(null);

      const result = await service.unlike(POST_ID, USER_ID);

      expect(mockPrisma.like.count).toHaveBeenCalled();
      expect(result.likesCount).toBe(5);
    });

    it('throws 404 when post does not exist', async () => {
      mockPrisma.post.findUnique.mockResolvedValueOnce(null);
      await expect(service.unlike(POST_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
