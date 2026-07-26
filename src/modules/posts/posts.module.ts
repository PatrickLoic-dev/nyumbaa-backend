import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { FanoutProcessor } from './queues/fanout.processor';
import { POST_FANOUT_QUEUE } from './posts.constants';
import { UploadModule } from '../../common/upload/upload.module';
import { RekognitionModule } from '../../common/rekognition/rekognition.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: { url: config.get<string>('redis.url') },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: POST_FANOUT_QUEUE }),
    UploadModule,
    RekognitionModule,
  ],
  controllers: [PostsController],
  providers: [PostsService, FanoutProcessor],
  exports: [PostsService],
})
export class PostsModule {}
