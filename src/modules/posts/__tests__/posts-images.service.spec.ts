import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnsupportedMediaTypeException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { PostVisibility, PostStatus, PostImageStatus } from '@prisma/client';
import { PostsService } from '../posts.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UploadService } from '../../../common/upload/upload.service';
import { RekognitionService } from '../../../common/rekognition/rekognition.service';
import { POST_FANOUT_QUEUE } from '../posts.constants';

const AUTHOR_ID = 'author-uuid';
const OTHER_ID = 'other-uuid';
const POST_ID = 'post-uuid';
const IMAGE_ID = 'image-uuid';

const mockImage = {
  id: IMAGE_ID,
  postId: POST_ID,
  s3Key: 'posts/uuid/photo.jpg',
  cdnUrl: 'https://project.supabase.co/storage/v1/object/public/post-images/posts/uuid/photo.jpg',
  altText: 'A beautiful view',
  order: 0,
  status: PostImageStatus.pending_review,
  createdAt: new Date(),
};

const mockPost = {
  id: POST_ID,
  authorId: AUTHOR_ID,
  content: 'Post with image',
  visibility: PostVisibility.public,
  status: PostStatus.published,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: AUTHOR_ID, displayName: 'Alice', avatarUrl: null },
  mentions: [],
  images: [mockImage],
};

const mockPrisma = {
  post: {
    create: jest.fn().mockResolvedValue(mockPost),
    update: jest.fn().mockResolvedValue(mockPost),
    findUnique: jest.fn().mockResolvedValue(mockPost),
  },
  postImage: {
    update: jest.fn().mockResolvedValue(mockImage),
  },
  profile: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const mockQueue = { add: jest.fn().mockResolvedValue({}) };

const mockConfig = {
  get: jest.fn((key: string) => {
    const conf: Record<string, string> = {
      'supabase.url': 'https://project.supabase.co',
      'storage.bucket': 'post-images',
    };
    return conf[key] ?? undefined;
  }),
};

const mockUploadService = {
  createPostImageUploadUrl: jest.fn().mockResolvedValue({
    uploadUrl: 'https://signed-upload-url.example.com',
    s3Key: 'posts/uuid/photo.jpg',
    cdnUrl: 'https://project.supabase.co/storage/v1/object/public/post-images/posts/uuid/photo.jpg',
  }),
  deleteObject: jest.fn().mockResolvedValue(undefined),
};

const mockRekognition = { isNsfw: jest.fn().mockResolvedValue(false) };

describe('PostsService — images (NYUMBAA-31)', () => {
  let service: PostsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PostsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: UploadService, useValue: mockUploadService },
        { provide: RekognitionService, useValue: mockRekognition },
        { provide: getQueueToken(POST_FANOUT_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<PostsService>(PostsService);
    jest.clearAllMocks();
    mockPrisma.post.create.mockResolvedValue(mockPost);
    mockPrisma.postImage.update.mockResolvedValue(mockImage);
    mockPrisma.profile.findMany.mockResolvedValue([]);
    mockQueue.add.mockResolvedValue({});
    mockRekognition.isNsfw.mockResolvedValue(false);
    mockConfig.get.mockImplementation((key: string) => {
      const conf: Record<string, string> = {
        'supabase.url': 'https://project.supabase.co',
        'storage.bucket': 'post-images',
      };
      return conf[key] ?? undefined;
    });
  });

  describe('generateUploadUrl', () => {
    it('returns a presigned URL, s3Key, and cdnUrl', async () => {
      const result = await service.generateUploadUrl('photo.jpg', 'image/jpeg');
      expect(result.uploadUrl).toBeDefined();
      expect(result.s3Key).toBeDefined();
      expect(result.cdnUrl).toBeDefined();
      expect(mockUploadService.createPostImageUploadUrl).toHaveBeenCalledWith('photo.jpg', 'image/jpeg');
    });

    it('rejects unsupported mime type (415)', async () => {
      mockUploadService.createPostImageUploadUrl.mockRejectedValueOnce(
        new UnsupportedMediaTypeException({ error: 'UNSUPPORTED_FORMAT', accepted: ['jpg', 'png', 'webp'] }),
      );
      await expect(service.generateUploadUrl('doc.pdf', 'application/pdf')).rejects.toThrow(
        UnsupportedMediaTypeException,
      );
    });
  });

  describe('create with images', () => {
    it('creates a post with images and enqueues fanout', async () => {
      const result = await service.create(AUTHOR_ID, {
        content: 'Post with image',
        visibility: PostVisibility.public,
        images: [{ s3Key: 'posts/uuid/photo.jpg', altText: 'A beautiful view', order: 0 }],
      });

      expect(mockPrisma.post.create).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(result.images[0].altText).toBe('A beautiful view');
    });

    it('stores altText in the created image for accessibility', async () => {
      await service.create(AUTHOR_ID, {
        content: 'Test',
        visibility: PostVisibility.public,
        images: [{ s3Key: 'posts/uuid/photo.jpg', altText: 'Description for screen readers', order: 0 }],
      });

      const createData = mockPrisma.post.create.mock.calls[0][0].data;
      expect(createData.images.create[0].altText).toBe('Description for screen readers');
    });

    it('creates post with 1 to 5 images and correct order payload', async () => {
      const images = Array.from({ length: 5 }, (_, i) => ({
        s3Key: `posts/uuid/photo${i}.jpg`,
        altText: `Image ${i}`,
        order: i,
      }));

      await service.create(AUTHOR_ID, {
        content: 'Five images',
        visibility: PostVisibility.public,
        images,
      });

      const createData = mockPrisma.post.create.mock.calls[0][0].data;
      expect(createData.images.create).toHaveLength(5);
      createData.images.create.forEach((img: { order: number }, idx: number) => {
        expect(img.order).toBe(idx);
      });
    });
  });

  describe('image moderation (Rekognition)', () => {
    it('approves images when Rekognition returns clean', async () => {
      mockRekognition.isNsfw.mockResolvedValue(false);

      await service.create(AUTHOR_ID, {
        content: 'Clean post',
        visibility: PostVisibility.public,
        images: [{ s3Key: 'posts/uuid/clean.jpg', order: 0 }],
      });

      // Give the async moderation time to run
      await new Promise((r) => setTimeout(r, 50));

      expect(mockPrisma.postImage.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: PostImageStatus.approved } }),
      );
    });

    it('deletes S3 object and marks post removed when image is NSFW', async () => {
      mockRekognition.isNsfw.mockResolvedValue(true);

      const nsfwKey = 'posts/uuid/nsfw.jpg';
      mockPrisma.post.create.mockResolvedValueOnce({
        ...mockPost,
        images: [{ ...mockImage, id: IMAGE_ID, s3Key: nsfwKey }],
      });

      await service.create(AUTHOR_ID, {
        content: 'NSFW post',
        visibility: PostVisibility.public,
        images: [{ s3Key: nsfwKey, order: 0 }],
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockUploadService.deleteObject).toHaveBeenCalledWith(nsfwKey);
      expect(mockPrisma.post.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: PostStatus.removed } }),
      );
    });
  });

  describe('findOneForUser', () => {
    it('returns post with images for author (private)', async () => {
      mockPrisma.post.findUnique.mockResolvedValue({
        ...mockPost,
        visibility: PostVisibility.private,
      });
      const result = await service.findOneForUser(POST_ID, AUTHOR_ID);
      expect(result.images).toHaveLength(1);
    });

    it('throws ForbiddenException for private post accessed by third party', async () => {
      mockPrisma.post.findUnique.mockResolvedValue({
        ...mockPost,
        visibility: PostVisibility.private,
      });
      await expect(service.findOneForUser(POST_ID, OTHER_ID)).rejects.toThrow(ForbiddenException);
    });
  });
});
