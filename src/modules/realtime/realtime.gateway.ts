import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/realtime' })
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join-room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    client.join(conversationId);
    return { event: 'joined', data: conversationId };
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: string,
  ) {
    client.leave(conversationId);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; userId: string },
  ) {
    client.to(data.conversationId).emit('typing', { userId: data.userId });
  }

  @SubscribeMessage('read-receipt')
  handleReadReceipt(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; messageId: string; userId: string },
  ) {
    client.to(data.conversationId).emit('read-receipt', data);
  }

  @SubscribeMessage('subscribe-post')
  handleSubscribePost(
    @ConnectedSocket() client: Socket,
    @MessageBody() postId: string,
  ) {
    client.join(`post:${postId}`);
  }

  @SubscribeMessage('unsubscribe-post')
  handleUnsubscribePost(
    @ConnectedSocket() client: Socket,
    @MessageBody() postId: string,
  ) {
    client.leave(`post:${postId}`);
  }

  emitMessage(conversationId: string, message: object) {
    this.server.to(conversationId).emit('message:new', message);
  }

  emitTranslation(
    conversationId: string,
    payload: { messageId: string; lang: string; translatedText: string },
  ) {
    this.server.to(conversationId).emit('message:translated', payload);
  }

  emitPostUpdated(postId: string, payload: { likesCount?: number; commentsCount?: number }) {
    this.server.to(`post:${postId}`).emit('post:updated', { postId, ...payload });
  }
}
