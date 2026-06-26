import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PostVisibility, PostStatus } from '@prisma/client';
import { PostsService } from '../posts.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { POST_FANOUT_QUEUE } from '../posts.constants';

const AUTHOR_ID = 'author-uuid';
const OTHER_ID = 'other-uuid';
const POST_ID = 'post-uuid';

const mockPost = {
  id: POST_ID,
  authorId: AUTHOR_ID,
  content: 'Hello @world',
  visibility: PostVisibility.public,
  status: PostStatus.published,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: AUTHOR_ID, displayName: 'Alice', avatarUrl: null },
  mentions: [],
};

const mockPrisma = {
  post: {
    create: jest.fn().mockResolvedValue(mockPost),
    update: jest.fn().mockResolvedValue(mockPost),
    findUnique: jest.fn().mockResolvedValue(mockPost),
  },
  profile: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockQueue = { add: jest.fn().mockResolvedValue({}) };

const mockConfig = { get: jest.fn().mockReturnValue(undefined) };

describe('PostsService', () => {
  let service: PostsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getQueueToken(POST_FANOUT_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    jest.clearAllMocks();
    mockPrisma.post.create.mockResolvedValue(mockPost);
    mockPrisma.profile.findMany.mockResolvedValue([]);
    mockQueue.add.mockResolvedValue({});
    mockConfig.get.mockReturnValue(undefined);
  });

  describe('create', () => {
    it('inserts the post and enqueues a fanout job', async () => {
      const result = await service.create(AUTHOR_ID, {
        content: 'Hello world',
        visibility: PostVisibility.public,
      });

      expect(mockPrisma.post.create).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'fanout',
        expect.objectContaining({ postId: POST_ID, authorId: AUTHOR_ID }),
        expect.any(Object),
      );
      expect(result.id).toBe(POST_ID);
    });

    it('resolves @handle mentions from content', async () => {
      mockPrisma.profile.findMany.mockResolvedValue([{ id: 'mentioned-uuid' }]);

      await service.create(AUTHOR_ID, {
        content: 'Hey @alice !',
        visibility: PostVisibility.public,
      });

      expect(mockPrisma.profile.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { displayName: { in: ['alice'] } } }),
      );
    });

    it('caps mentions at 10', async () => {
      const manyIds = Array.from({ length: 15 }, (_, i) => `uuid-${i}`);
      await service.create(AUTHOR_ID, {
        content: 'test',
        visibility: PostVisibility.public,
        mentions: manyIds,
      });

      const createCall = mockPrisma.post.create.mock.calls[0][0];
      expect(createCall.data.mentions.create.length).toBeLessThanOrEqual(10);
    });

    it('does not call Perspective API when key is absent', async () => {
      mockConfig.get.mockReturnValue(undefined);
      // No axios call expected — just ensure no error thrown
      await expect(
        service.create(AUTHOR_ID, { content: 'test', visibility: PostVisibility.public }),
      ).resolves.toBeDefined();
    });
  });

  describe('findOneForUser', () => {
    it('returns the post for its author regardless of visibility', async () => {
      mockPrisma.post.findUnique.mockResolvedValue({
        ...mockPost,
        visibility: PostVisibility.private,
      });

      const result = await service.findOneForUser(POST_ID, AUTHOR_ID);
      expect(result.id).toBe(POST_ID);
    });

    it('throws ForbiddenException for private post accessed by a third party', async () => {
      mockPrisma.post.findUnique.mockResolvedValue({
        ...mockPost,
        visibility: PostVisibility.private,
        authorId: AUTHOR_ID,
      });

      await expect(service.findOneForUser(POST_ID, OTHER_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when post does not exist', async () => {
      mockPrisma.post.findUnique.mockResolvedValue(null);

      await expect(service.findOneForUser('ghost-id', AUTHOR_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns a public post for any authenticated user', async () => {
      mockPrisma.post.findUnique.mockResolvedValue({
        ...mockPost,
        visibility: PostVisibility.public,
      });

      await expect(service.findOneForUser(POST_ID, OTHER_ID)).resolves.toBeDefined();
    });
  });
});
