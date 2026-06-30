import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PostStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  LIKES_NOTIFY_QUEUE,
  LIKES_REDIS_KEY,
  LIKES_NOTIFY_DELAY_MS,
} from './likes.constants';
import type { LikesNotifyJobData } from './queues/likes-notify.processor';

@Injectable()
export class LikesService {
  private readonly logger = new Logger(LikesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @InjectQueue(LIKES_NOTIFY_QUEUE) private readonly notifyQueue: Queue,
  ) {}

  async like(postId: string, userId: string) {
    const post = await this.assertPost(postId);

    // INSERT ... ON CONFLICT DO NOTHING — guaranteed idempotence
    await this.prisma.$executeRaw`
      INSERT INTO likes (post_id, user_id, created_at)
      VALUES (${postId}, ${userId}, NOW())
      ON CONFLICT (post_id, user_id) DO NOTHING
    `;

    // Atomic Redis INCR — fallback to SQL count if Redis unavailable
    const redisKey = LIKES_REDIS_KEY(postId);
    let likesCount = await this.redis.incr(redisKey);
    if (likesCount === null) {
      this.logger.warn(`Redis unavailable for ${redisKey} — using SQL fallback`);
      likesCount = await this.getLikesCountFromSql(postId);
    }

    // Enqueue consolidated notification (jobId deduplicates within the 5-min window)
    if (post.authorId !== userId) {
      await this.enqueueNotification(postId, post.authorId, likesCount);
    }

    return { postId, liked: true, likesCount };
  }

  async unlike(postId: string, userId: string) {
    await this.assertPost(postId);

    await this.prisma.like.deleteMany({ where: { postId, userId } });

    const redisKey = LIKES_REDIS_KEY(postId);
    let likesCount = await this.redis.decr(redisKey);
    if (likesCount === null) {
      this.logger.warn(`Redis unavailable for ${redisKey} — using SQL fallback`);
      likesCount = await this.getLikesCountFromSql(postId);
    }

    return { postId, liked: false, likesCount };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async assertPost(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, status: true },
    });

    if (!post || post.status === PostStatus.removed) {
      throw new NotFoundException({ error: 'POST_NOT_FOUND' });
    }

    return post;
  }

  private async getLikesCountFromSql(postId: string): Promise<number> {
    return this.prisma.like.count({ where: { postId } });
  }

  private async enqueueNotification(
    postId: string,
    postAuthorId: string,
    likesCount: number,
  ): Promise<void> {
    try {
      await this.notifyQueue.add(
        'notify-author',
        { postId, postAuthorId, likesCount } satisfies LikesNotifyJobData,
        {
          jobId: `likes:notify:${postId}`, // same ID → BullMQ deduplicates, max 1 job/window
          delay: LIKES_NOTIFY_DELAY_MS,
          removeOnComplete: true,
          removeOnFail: 5,
        },
      );
    } catch (err) {
      this.logger.error(`Failed to enqueue like notification for post ${postId}: ${(err as Error).message}`);
    }
  }
}
