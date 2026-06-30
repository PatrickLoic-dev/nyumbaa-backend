import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { FanoutProcessor } from './queues/fanout.processor';
import { POST_FANOUT_QUEUE } from './posts.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: POST_FANOUT_QUEUE }),
  ],
  controllers: [PostsController],
  providers: [PostsService, FanoutProcessor],
  exports: [PostsService],
})
export class PostsModule {}
