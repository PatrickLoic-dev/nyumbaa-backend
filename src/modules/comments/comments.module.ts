import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentOwnerOrPostOwnerGuard } from './guards/comment-owner-or-post-owner.guard';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentOwnerOrPostOwnerGuard],
  exports: [CommentsService],
})
export class CommentsModule {}
