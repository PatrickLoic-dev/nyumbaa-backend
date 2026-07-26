import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { UploadModule } from '../../common/upload/upload.module';
import { RekognitionModule } from '../../common/rekognition/rekognition.module';

@Module({
  imports: [UploadModule, RekognitionModule],
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
