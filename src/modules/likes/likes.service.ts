import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { PostStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  LIKES_NOTIFY_QUEUE,
  LIKES_SYNC_QUEUE,
  LIKES_REDIS_KEY,
  LIKES_NOTIFY_DELAY_MS,
} from './likes.constants';
import type { LikesNotifyJobData } from './queues/likes-notify.processor';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes

@Injectable()
export class LikesService implements OnModuleDestroy {
  private readonly logger = new Logger(LikesService.name);
  private notifyQueue: Queue | null = null;
  private syncQueue: Queue | null = null;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;
  private queuesInitialized = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    // Sync cron via plain setInterval — no Redis dependency
    this.syncIntervalId = setInterval(() => {
      this.syncCountersToSql().catch((err: Error) =>
        this.logger.warn(`Sync failed: ${err.message}`),
      );
    }, SYNC_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.syncIntervalId) clearInterval(this.syncIntervalId);
    this.notifyQueue?.close().catch(() => {});
    this.syncQueue?.close().catch(() => {});
  }

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

  private getOrCreateNotifyQueue(): Queue | null {
    if (this.notifyQueue) return this.notifyQueue;
    const url = this.config.get<string>('redis.url') ?? 'redis://127.0.0.1:6379';
    try {
      const q = new Queue(LIKES_NOTIFY_QUEUE, {
        connection: { url, lazyConnect: true, maxRetriesPerRequest: null, enableOfflineQueue: false },
      });
      q.on('error', (err: Error) =>
        this.logger.warn(`Notify queue error: ${err.message}`),
      );
      this.notifyQueue = q;
      return q;
    } catch {
      return null;
    }
  }

  private getOrCreateSyncQueue(): Queue | null {
    if (this.syncQueue) return this.syncQueue;
    const url = this.config.get<string>('redis.url') ?? 'redis://127.0.0.1:6379';
    try {
      const q = new Queue(LIKES_SYNC_QUEUE, {
        connection: { url, lazyConnect: true, maxRetriesPerRequest: null, enableOfflineQueue: false },
      });
      q.on('error', (err: Error) =>
        this.logger.warn(`Sync queue error: ${err.message}`),
      );
      this.syncQueue = q;
      return q;
    } catch {
      return null;
    }
  }

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
    const queue = this.getOrCreateNotifyQueue();
    if (!queue) return;
    try {
      await queue.add(
        'notify-author',
        { postId, postAuthorId, likesCount } satisfies LikesNotifyJobData,
        {
          jobId: `likes:notify:${postId}`,
          delay: LIKES_NOTIFY_DELAY_MS,
          removeOnComplete: true,
          removeOnFail: 5,
        },
      );
    } catch (err) {
      this.logger.error(`Failed to enqueue like notification for post ${postId}: ${(err as Error).message}`);
    }
  }

  private async syncCountersToSql(): Promise<void> {
    const keys = await this.redis.keys('post:*:likes_count');
    if (keys.length === 0) return;

    this.logger.log(`Syncing ${keys.length} Redis likes counters to PostgreSQL`);

    await Promise.allSettled(
      keys.map(async (key) => {
        const postId = key.split(':')[1];
        const raw = await this.redis.get(key);
        if (raw === null) return;
        await this.prisma.post.updateMany({
          where: { id: postId },
          data: { likesCount: parseInt(raw, 10) },
        });
      }),
    );
  }
}
