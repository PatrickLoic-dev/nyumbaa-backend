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
import { PrismaService } from '../../common/prisma/prisma.service';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/realtime' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ── Conversation rooms ──────────────────────────────────────────────────────

  @SubscribeMessage('join-room')
  handleJoinRoom(@ConnectedSocket() client: Socket, @MessageBody() conversationId: string) {
    client.join(conversationId);
    return { event: 'joined', data: conversationId };
  }

  @SubscribeMessage('leave-room')
  handleLeaveRoom(@ConnectedSocket() client: Socket, @MessageBody() conversationId: string) {
    client.leave(conversationId);
  }

  // User-specific room so we can push incoming calls even outside a conversation
  @SubscribeMessage('join-user-room')
  handleJoinUserRoom(@ConnectedSocket() client: Socket, @MessageBody() userId: string) {
    client.join(`user:${userId}`);
    return { event: 'joined-user', data: userId };
  }

  // ── Typing indicator ────────────────────────────────────────────────────────

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; userId: string },
  ) {
    client.to(data.conversationId).emit('typing', { userId: data.userId });
  }

  // ── Read receipts ───────────────────────────────────────────────────────────

  @SubscribeMessage('read-receipt')
  async handleReadReceipt(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; messageId: string; userId: string },
  ) {
    // Persist read status on all messages up to this one
    try {
      const message = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: { createdAt: true, conversationId: true },
      });
      if (message) {
        const unread = await this.prisma.message.findMany({
          where: {
            conversationId: data.conversationId,
            createdAt: { lte: message.createdAt },
            senderId: { not: data.userId },
          },
          select: { id: true },
        });
        await Promise.all(
          unread.map((m) =>
            this.prisma.messageStatus_.upsert({
              where: { messageId_userId: { messageId: m.id, userId: data.userId } },
              create: { messageId: m.id, userId: data.userId, status: 'read' },
              update: { status: 'read' },
            }),
          ),
        );
      }
    } catch (e) {
      this.logger.error(`read-receipt DB error: ${(e as Error).message}`);
    }

    client.to(data.conversationId).emit('read-receipt', data);
  }

  // ── Call signaling ──────────────────────────────────────────────────────────

  @SubscribeMessage('call:start')
  async handleCallStart(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { conversationId: string; callerId: string; callerName: string; callerAvatar: string | null; type: 'audio' | 'video' },
  ) {
    // Notify all members in the conversation who are not the caller
    try {
      const members = await this.prisma.conversationMember.findMany({
        where: { conversationId: data.conversationId, userId: { not: data.callerId } },
        select: { userId: true },
      });
      for (const m of members) {
        this.server.to(`user:${m.userId}`).emit('call:incoming', {
          conversationId: data.conversationId,
          callerId: data.callerId,
          callerName: data.callerName,
          callerAvatar: data.callerAvatar,
          type: data.type,
        });
      }
    } catch (e) {
      this.logger.error(`call:start error: ${(e as Error).message}`);
    }
    client.join(`call:${data.conversationId}`);
  }

  @SubscribeMessage('call:accept')
  handleCallAccept(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; userId: string },
  ) {
    client.join(`call:${data.conversationId}`);
    this.server.to(`call:${data.conversationId}`).emit('call:accepted', { userId: data.userId });
  }

  @SubscribeMessage('call:reject')
  handleCallReject(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { conversationId: string; userId: string },
  ) {
    this.server.to(`call:${data.conversationId}`).emit('call:rejected', { userId: data.userId });
  }

  @SubscribeMessage('call:end')
  handleCallEnd(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; userId: string },
  ) {
    this.server.to(`call:${data.conversationId}`).emit('call:ended', { userId: data.userId });
    client.leave(`call:${data.conversationId}`);
  }

  // ── Posts ───────────────────────────────────────────────────────────────────

  @SubscribeMessage('subscribe-post')
  handleSubscribePost(@ConnectedSocket() client: Socket, @MessageBody() postId: string) {
    client.join(`post:${postId}`);
  }

  @SubscribeMessage('unsubscribe-post')
  handleUnsubscribePost(@ConnectedSocket() client: Socket, @MessageBody() postId: string) {
    client.leave(`post:${postId}`);
  }

  // ── Emit helpers ────────────────────────────────────────────────────────────

  emitMessage(conversationId: string, message: object) {
    this.server.to(conversationId).emit('message:new', message);
  }

  emitMessageNotify(recipientId: string, payload: {
    conversationId: string;
    senderName: string;
    preview: string;
  }) {
    this.server.to(`user:${recipientId}`).emit('message:notify', payload);
  }

  emitMessageDeleted(conversationId: string, messageId: string) {
    this.server.to(conversationId).emit('message:deleted', { messageId });
  }

  emitTranslation(conversationId: string, payload: { messageId: string; lang: string; translatedText: string }) {
    this.server.to(conversationId).emit('message:translated', payload);
  }

  emitPostUpdated(postId: string, payload: { likesCount?: number; commentsCount?: number }) {
    this.server.to(`post:${postId}`).emit('post:updated', { postId, ...payload });
  }
}
