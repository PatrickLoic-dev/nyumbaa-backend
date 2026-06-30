import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { LikesController } from './likes.controller';
import { LikesService } from './likes.service';
import { LikesNotifyProcessor } from './queues/likes-notify.processor';
import { LikesSyncProcessor } from './queues/likes-sync.processor';
import { LIKES_NOTIFY_QUEUE, LIKES_SYNC_QUEUE, LIKES_SYNC_CRON } from './likes.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redis.url') },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: LIKES_NOTIFY_QUEUE },
      { name: LIKES_SYNC_QUEUE },
    ),
  ],
  controllers: [LikesController],
  providers: [LikesService, LikesNotifyProcessor, LikesSyncProcessor],
  exports: [LikesService],
})
export class LikesModule implements OnModuleInit {
  constructor(
    @InjectQueue(LIKES_SYNC_QUEUE) private readonly syncQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.syncQueue.add(
      'sync-to-postgres',
      {},
      {
        repeat: { pattern: LIKES_SYNC_CRON },
        jobId: 'likes:sync:cron',
        removeOnComplete: true,
      },
    );
  }
}
