import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { CommentOwnerOrPostOwnerGuard } from './guards/comment-owner-or-post-owner.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [RealtimeModule, NotificationsModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentOwnerOrPostOwnerGuard],
  exports: [CommentsService],
})
export class CommentsModule {}
