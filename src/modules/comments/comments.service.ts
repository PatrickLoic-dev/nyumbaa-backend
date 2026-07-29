import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CommentStatus, PostStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CursorCommentsDto } from './dto/cursor-comments.dto';

const TOXICITY_THRESHOLD = 0.8;

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async create(postId: string, authorId: string, dto: CreateCommentDto) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, status: true, commentsEnabled: true },
    });

    if (!post || post.status === PostStatus.removed) {
      throw new NotFoundException({ error: 'POST_NOT_FOUND' });
    }

    if (!post.commentsEnabled) {
      throw new ForbiddenException({ error: 'COMMENTS_DISABLED' });
    }

    const comment = await this.prisma.comment.create({
      data: {
        postId,
        authorId,
        content: dto.content,
        status: CommentStatus.published,
      },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    // Resolve and persist @mentions (best-effort, non-blocking)
    this.persistMentionsAsync(postId, dto.content, dto.mentions ?? []).catch((err) =>
      this.logger.error(`Comment mention error: ${err.message}`),
    );

    // Notify post author (fire-and-forget stub — full impl in NotificationsModule)
    if (post.authorId !== authorId) {
      this.notifyPostAuthorAsync(post.authorId, authorId, postId).catch((err) =>
        this.logger.error(`Comment notification error: ${err.message}`),
      );
    }

    // Async Perspective API moderation
    this.moderateAsync(comment.id, dto.content, authorId).catch((err) =>
      this.logger.error(`Comment moderation error for ${comment.id}: ${err.message}`),
    );

    // Broadcast updated comment count (fire-and-forget)
    this.prisma.comment
      .count({ where: { postId, status: CommentStatus.published } })
      .then((commentsCount) => this.realtime.emitPostUpdated(postId, { commentsCount }))
      .catch(() => {});

    return comment;
  }

  async findAll(postId: string, pagination: CursorCommentsDto) {
    const limit = pagination.limit ?? 10;

    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true },
    });

    if (!post || post.status === PostStatus.removed) {
      throw new NotFoundException({ error: 'POST_NOT_FOUND' });
    }

    const comments = await this.prisma.comment.findMany({
      where: {
        postId,
        status: { not: CommentStatus.removed },
        ...(pagination.cursor
          ? {
              createdAt: {
                gt: await this.getCursorDate(pagination.cursor),
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    const hasMore = comments.length > limit;
    const data = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return { data, nextCursor, hasMore };
  }

  async remove(commentId: string): Promise<void> {
    await this.prisma.comment.delete({ where: { id: commentId } });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async getCursorDate(cursorId: string): Promise<Date> {
    const cursor = await this.prisma.comment.findUnique({
      where: { id: cursorId },
      select: { createdAt: true },
    });
    return cursor?.createdAt ?? new Date(0);
  }

  private async persistMentionsAsync(
    _postId: string,
    content: string,
    explicitIds: string[],
  ): Promise<void> {
    const handles = [...content.matchAll(/@([a-zA-Z0-9_]{2,30})/g)].map((m) => m[1]);
    if (handles.length === 0 && explicitIds.length === 0) return;

    if (handles.length > 0) {
      await this.prisma.profile.findMany({
        where: { displayName: { in: handles } },
        select: { id: true },
      });
    }
    // Mention fan-out notification logic lives in NotificationsModule (Phase 2)
  }

  private async notifyPostAuthorAsync(
    _postAuthorId: string,
    _commentAuthorId: string,
    _postId: string,
  ): Promise<void> {
    // Expo push notification via NotificationsModule — Phase 2
    this.logger.debug(`Stub: notify post author about new comment on post ${_postId}`);
  }

  private async moderateAsync(
    commentId: string,
    content: string,
    _authorId: string,
  ): Promise<void> {
    const apiKey = this.config.get<string>('perspective.apiKey');
    if (!apiKey) return;

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

    if (score >= TOXICITY_THRESHOLD) {
      await this.prisma.comment.update({
        where: { id: commentId },
        data: { status: CommentStatus.flagged },
      });
      this.logger.warn(`Comment ${commentId} flagged (toxicity: ${score.toFixed(2)})`);
      // Notify comment author → NotificationsModule Phase 2
    }
  }
}
