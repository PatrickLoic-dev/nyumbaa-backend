import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { LIKES_SYNC_QUEUE } from '../likes.constants';

@Processor(LIKES_SYNC_QUEUE, { autorun: false })
export class LikesSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(LikesSyncProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
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
