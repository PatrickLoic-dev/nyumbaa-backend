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
import { PostStatus, PostVisibility } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
      this.logger.warn(`Fanout queue unavailable (Redis down): ${(err as Error).message}`);
    }
  }

  async create(authorId: string, dto: CreatePostDto) {
    const mentionedIds = await this.resolveMentions(dto.content, dto.mentions ?? []);

    const post = await this.prisma.post.create({
      data: {
        authorId,
        content: dto.content,
        visibility: dto.visibility,
        status: PostStatus.published,
        mentions: {
          create: mentionedIds.map((mentionedUserId) => ({ mentionedUserId })),
        },
      },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        mentions: { include: { mentionedUser: { select: { id: true, displayName: true } } } },
      },
    });

    // Fire-and-forget — never blocks HTTP 201
    this.enqueueFanout(post.id, authorId, dto.visibility).catch(() => {});
    this.moderateAsync(post.id, dto.content, authorId).catch(() => {});

    return post;
  }

  async findOneForUser(postId: string, requesterId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { author: true, mentions: true },
    });

    if (!post) throw new NotFoundException('Post not found');
    if (post.visibility === PostVisibility.private && post.authorId !== requesterId) {
      throw new ForbiddenException('This post is private');
    }

    return post;
  }

  // ---------------------------------------------------------------------------

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
    const resolved = handleMatches.length > 0
      ? await this.prisma.profile.findMany({ where: { displayName: { in: handleMatches } }, select: { id: true } })
      : [];
    const all = new Set([...explicitIds, ...resolved.map((p) => p.id)]);
    return [...all].slice(0, 10);
  }

  private async moderateAsync(postId: string, content: string, _authorId: string) {
    const apiKey = this.config.get<string>('perspective.apiKey');
    if (!apiKey) return;
    const response = await axios.post(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
      { comment: { text: content }, languages: ['fr', 'en'], requestedAttributes: { TOXICITY: {} } },
      { timeout: 5000 },
    );
    const score: number = response.data?.attributeScores?.TOXICITY?.summaryScore?.value ?? 0;
    if (score >= PERSPECTIVE_TOXICITY_THRESHOLD) {
      await this.prisma.post.update({ where: { id: postId }, data: { status: PostStatus.under_review } });
      this.logger.warn(`Post ${postId} flagged under_review (score: ${score.toFixed(2)})`);
    }
  }
}
