import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [ConversationsModule, RealtimeModule],
  controllers: [MessagesController],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
