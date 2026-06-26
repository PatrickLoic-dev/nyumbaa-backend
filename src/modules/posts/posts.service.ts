import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PostStatus, PostVisibility } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { POST_FANOUT_QUEUE, PERSPECTIVE_TOXICITY_THRESHOLD } from './posts.constants';
import type { FanoutJobData } from './queues/fanout.processor';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(POST_FANOUT_QUEUE) private readonly fanoutQueue: Queue,
  ) {}

  async create(authorId: string, dto: CreatePostDto) {
    // Resolve @mention handles from content + explicit UUID list
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

    // Enqueue fanout — non-blocking
    await this.fanoutQueue.add(
      'fanout',
      { postId: post.id, authorId, visibility: dto.visibility } satisfies FanoutJobData,
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    // Async moderation — fire-and-forget, never blocks HTTP response
    this.moderateAsync(post.id, dto.content, authorId).catch((err) =>
      this.logger.error(`Moderation error for post ${post.id}: ${err.message}`),
    );

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
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Merges explicit UUID mentions with @handle mentions resolved via displayName lookup. */
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

  /** Calls Perspective API and flags the post under_review if toxicity ≥ threshold. */
  private async moderateAsync(postId: string, content: string, authorId: string): Promise<void> {
    const apiKey = this.config.get<string>('perspective.apiKey');
    if (!apiKey) return; // Skip in dev when key is absent

    const response = await axios.post(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
      {
        comment: { text: content },
        languages: ['fr', 'en'],
        requestedAttributes: { TOXICITY: {} },
      },
      { timeout: 5000 },
    );

    const score: number =
      response.data?.attributeScores?.TOXICITY?.summaryScore?.value ?? 0;

    if (score >= PERSPECTIVE_TOXICITY_THRESHOLD) {
      await this.prisma.post.update({
        where: { id: postId },
        data: { status: PostStatus.under_review },
      });
      this.logger.warn(
        `Post ${postId} flagged under_review (toxicity score: ${score.toFixed(2)})`,
      );
      // Notification to author is handled by NotificationsModule (future hook)
    }
  }
}
