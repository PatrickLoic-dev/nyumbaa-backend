import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Queue } from 'bullmq';
import { PostStatus, PostVisibility, PostImageStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';
import { RekognitionService } from '../../common/rekognition/rekognition.service';
import { CreatePostDto } from './dto/create-post.dto';
import { POST_FANOUT_QUEUE, PERSPECTIVE_TOXICITY_THRESHOLD } from './posts.constants';

export interface FanoutJobData {
  postId: string;
  authorId: string;
  visibility: string;
}

@Injectable()
export class PostsService implements OnModuleInit {
  private readonly logger = new Logger(PostsService.name);
  private fanoutQueue: Queue | null = null;
  private topicsCache: { data: { label: string; count: number }[]; expiresAt: number } | null = null;
  private trendingCache: { data: unknown[]; expiresAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly uploadService: UploadService,
    private readonly rekognition: RekognitionService,
  ) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('redis.url') ?? 'redis://127.0.0.1:6379';
    try {
      this.fanoutQueue = new Queue(POST_FANOUT_QUEUE, {
        connection: { url: redisUrl, lazyConnect: true, maxRetriesPerRequest: null, enableOfflineQueue: false },
      });
      this.fanoutQueue.on('error', (err: Error) =>
        this.logger.warn(`Fanout queue error (Redis unavailable): ${err.message}`),
      );
    } catch (err) {
      this.logger.warn(`Fanout queue unavailable: ${(err as Error).message}`);
    }
  }

  async create(authorId: string, dto: CreatePostDto) {
    const mentionedIds = await this.resolveMentions(dto.content ?? '', dto.mentions ?? []);

    const post = await this.prisma.post.create({
      data: {
        authorId,
        content: dto.content ?? '',
        visibility: dto.visibility,
        status: PostStatus.published,
        mentions: {
          create: mentionedIds.map((mentionedUserId) => ({ mentionedUserId })),
        },
        images: dto.images?.length
          ? {
              create: dto.images.map((img) => ({
                s3Key: img.s3Key,
                cdnUrl: this.buildCdnUrl(img.s3Key),
                altText: img.altText,
                order: img.order,
                status: PostImageStatus.pending_review,
              })),
            }
          : undefined,
        videos: dto.videos?.length
          ? {
              create: dto.videos.map((vid) => ({
                s3Key: vid.s3Key,
                cdnUrl: this.buildCdnUrl(vid.s3Key),
                thumbnailUrl: vid.thumbnailS3Key ? this.buildCdnUrl(vid.thumbnailS3Key) : null,
                durationSec: vid.durationSec ?? null,
                order: vid.order,
                status: PostImageStatus.pending_review,
              })),
            }
          : undefined,
      },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        mentions: { include: { mentionedUser: { select: { id: true, displayName: true } } } },
        images: { orderBy: { order: 'asc' } },
        videos: { orderBy: { order: 'asc' } },
      },
    });

    // Fire-and-forget — never blocks HTTP 201
    this.enqueueFanout(post.id, authorId, dto.visibility).catch(() => {});
    this.moderateTextAsync(post.id, dto.content ?? '', authorId).catch(() => {});

    if (dto.images?.length) {
      this.moderateImagesAsync(
        post.id,
        post.images as { id: string; s3Key: string }[],
        authorId,
      ).catch((err) =>
        this.logger.error(`Image moderation error for post ${post.id}: ${err.message}`),
      );
    }

    return post;
  }

  async generateUploadUrl(filename: string, contentType: string) {
    return this.uploadService.createPostImageUploadUrl(filename, contentType);
  }

  async generateVideoUploadUrl(filename: string, contentType: string) {
    return this.uploadService.createPostVideoUploadUrl(filename, contentType);
  }

  async findFeed(requesterId: string, cursor?: string, limit = 15) {
    const take = limit + 1;
    const [posts, followingRows] = await Promise.all([
      this.prisma.post.findMany({
        where: {
          visibility: 'public',
          status: 'published',
          ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true, username: true } },
          images: { orderBy: { order: 'asc' } },
          videos: { orderBy: { order: 'asc' } },
          likes: { where: { userId: requesterId }, select: { userId: true } },
          reposts: { where: { userId: requesterId }, select: { userId: true } },
          bookmarks: { where: { userId: requesterId }, select: { userId: true } },
        },
      }),
      this.prisma.follow.findMany({
        where: { followerId: requesterId },
        select: { followingId: true },
      }),
    ]);

    const hasMore = posts.length > limit;
    const page = hasMore ? posts.slice(0, limit) : posts;

    // Enrich with repostedBy: if any followed user reposted this post (≠ requester)
    const postIds = page.map((p) => p.id);
    const followingIds = followingRows.map((r) => r.followingId);

    const repostMap = new Map<string, { id: string; displayName: string; avatarUrl: string | null }>();
    if (followingIds.length > 0 && postIds.length > 0) {
      const friendReposts = await this.prisma.repost.findMany({
        where: { postId: { in: postIds }, userId: { in: followingIds } },
        include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
      });
      for (const r of friendReposts) {
        if (!repostMap.has(r.postId)) repostMap.set(r.postId, r.user);
      }
    }

    const data = page.map((p) => ({
      ...p,
      likedByMe: p.likes.length > 0,
      repostedByMe: p.reposts.length > 0,
      bookmarkedByMe: p.bookmarks.length > 0,
      repostedBy: repostMap.get(p.id) ?? null,
      likes: undefined,
      reposts: undefined,
      bookmarks: undefined,
    }));

    return {
      data,
      nextCursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
      hasMore,
    };
  }

  async findTrending(requesterId: string, limit = 10) {
    const now = Date.now();
    if (this.trendingCache && now < this.trendingCache.expiresAt) {
      return this.trendingCache.data;
    }

    const since = new Date(now - 24 * 60 * 60 * 1000);
    const posts = await this.prisma.post.findMany({
      where: { visibility: 'public', status: 'published', createdAt: { gte: since } },
      orderBy: { likesCount: 'desc' },
      take: limit,
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true, username: true } },
        images: { orderBy: { order: 'asc' } },
        videos: { orderBy: { order: 'asc' } },
        likes: { where: { userId: requesterId }, select: { userId: true } },
        reposts: { where: { userId: requesterId }, select: { userId: true } },
        bookmarks: { where: { userId: requesterId }, select: { userId: true } },
      },
    });

    const data = posts.map((p) => ({
      ...p,
      likedByMe: p.likes.length > 0,
      repostedByMe: p.reposts.length > 0,
      bookmarkedByMe: p.bookmarks.length > 0,
      repostedBy: null,
      likes: undefined,
      reposts: undefined,
      bookmarks: undefined,
    }));

    this.trendingCache = { data, expiresAt: now + 60_000 };
    return data;
  }

  async findTrendingTopics() {
    const now = Date.now();
    if (this.topicsCache && now < this.topicsCache.expiresAt) {
      return this.topicsCache.data;
    }

    const since = new Date(now - 24 * 60 * 60 * 1000);
    const posts = await this.prisma.post.findMany({
      where: { status: 'published', createdAt: { gte: since } },
      select: {
        content: true,
        authorId: true,
        likesCount: true,
        createdAt: true,
        _count: { select: { comments: true } },
      },
    });

    // Extract hashtags and accumulate per-tag stats
    const tagStats: Record<string, { postCount: number; uniqueAuthors: Set<string>; engagement: number; firstSeenMs: number }> = {};
    const hashtagRe = /#([\wÀ-ɏͰ-ϿЀ-ӿ]+)/g;

    for (const post of posts) {
      const matches = [...post.content.matchAll(hashtagRe)].map((m) => m[1].toLowerCase());
      const uniqueTags = [...new Set(matches)];
      for (const tag of uniqueTags) {
        if (!tagStats[tag]) {
          tagStats[tag] = { postCount: 0, uniqueAuthors: new Set(), engagement: 0, firstSeenMs: post.createdAt.getTime() };
        }
        const s = tagStats[tag];
        s.postCount += 1;
        s.uniqueAuthors.add(post.authorId);
        s.engagement += post.likesCount + post._count.comments * 2;
        if (post.createdAt.getTime() < s.firstSeenMs) s.firstSeenMs = post.createdAt.getTime();
      }
    }

    const data = Object.entries(tagStats)
      .map(([label, s]) => {
        const hoursSinceFirst = (now - s.firstSeenMs) / (1000 * 60 * 60);
        const score = (s.uniqueAuthors.size * 2 + s.postCount + s.engagement) / Math.pow(hoursSinceFirst + 2, 1.8);
        return { label: `#${label}`, count: s.postCount, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ label, count }) => ({ label, count }));

    this.topicsCache = { data, expiresAt: now + 5 * 60 * 1000 };
    return data;
  }

  async findOneForUser(postId: string, requesterId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true, username: true } },
        images: { orderBy: { order: 'asc' } },
        videos: { orderBy: { order: 'asc' } },
        _count: { select: { comments: true } },
        likes: { where: { userId: requesterId }, select: { userId: true } },
        reposts: { where: { userId: requesterId }, select: { userId: true } },
      },
    });

    if (!post) throw new NotFoundException('Post not found');
    if (post.visibility === PostVisibility.private && post.authorId !== requesterId) {
      throw new ForbiddenException('This post is private');
    }

    return {
      ...post,
      commentsCount: post._count.comments,
      likedByMe: post.likes.length > 0,
      repostedByMe: post.reposts.length > 0,
      repostedBy: null,
      likes: undefined,
      reposts: undefined,
      _count: undefined,
    };
  }

  async deletePost(postId: string, requesterId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: {
        authorId: true,
        images: { select: { s3Key: true } },
        videos: { select: { s3Key: true } },
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== requesterId) throw new ForbiddenException('Not your post');
    this.logger.log({ action: 'delete_post', postId, requesterId });
    await this.prisma.post.delete({ where: { id: postId } });
    const s3Keys = [...post.images.map((i) => i.s3Key), ...post.videos.map((v) => v.s3Key)];
    for (const key of s3Keys) {
      this.uploadService.deleteObject(key).catch(() => {});
    }
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------

  private buildCdnUrl(s3Key: string): string {
    const supabaseUrl = this.config.get<string>('supabase.url')!;
    const bucket = this.config.get<string>('storage.bucket')!;
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${s3Key}`;
  }

  private async enqueueFanout(postId: string, authorId: string, visibility: string) {
    if (!this.fanoutQueue) return;
    try {
      await this.fanoutQueue.add(
        'fanout',
        { postId, authorId, visibility } satisfies FanoutJobData,
        { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
      );
    } catch (err) {
      this.logger.warn(`Fanout enqueue failed for post ${postId}: ${(err as Error).message}`);
    }
  }

  private async resolveMentions(content: string, explicitIds: string[]): Promise<string[]> {
    const handleMatches = [...content.matchAll(/@([a-zA-Z0-9_]{2,30})/g)].map((m) => m[1]);
    const resolved =
      handleMatches.length > 0
        ? await this.prisma.profile.findMany({
            where: { displayName: { in: handleMatches } },
            select: { id: true },
          })
        : [];
    const all = new Set([...explicitIds, ...resolved.map((p) => p.id)]);
    return [...all].slice(0, 10);
  }

  private async moderateTextAsync(postId: string, content: string, _authorId: string): Promise<void> {
    const apiKey = this.config.get<string>('perspective.apiKey');
    if (!apiKey || !content) return;
    const response = await axios.post(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
      { comment: { text: content }, languages: ['fr', 'en'], requestedAttributes: { TOXICITY: {} } },
      { timeout: 5000 },
    );
    const score: number = response.data?.attributeScores?.TOXICITY?.summaryScore?.value ?? 0;
    if (score >= PERSPECTIVE_TOXICITY_THRESHOLD) {
      await this.prisma.post.update({ where: { id: postId }, data: { status: PostStatus.under_review } });
      this.logger.warn(`Post ${postId} text flagged under_review (score: ${score.toFixed(2)})`);
    }
  }

  private async moderateImagesAsync(
    postId: string,
    images: { id: string; s3Key: string }[],
    _authorId: string,
  ): Promise<void> {
    const bucket = this.config.get<string>('storage.bucket')!;
    let postRejected = false;

    for (const image of images) {
      const nsfw = await this.rekognition.isNsfw(bucket, image.s3Key);
      if (nsfw) {
        await this.uploadService.deleteObject(image.s3Key);
        await this.prisma.postImage.update({ where: { id: image.id }, data: { status: PostImageStatus.rejected } });
        postRejected = true;
        this.logger.warn(`Image ${image.s3Key} rejected — NSFW content detected`);
      } else {
        await this.prisma.postImage.update({ where: { id: image.id }, data: { status: PostImageStatus.approved } });
      }
    }

    if (postRejected) {
      await this.prisma.post.update({ where: { id: postId }, data: { status: PostStatus.removed } });
      this.logger.warn(`Post ${postId} removed — NSFW image detected`);
    }
  }
}
