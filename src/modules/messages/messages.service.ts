import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConversationType, MessageType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { TranslationService } from '../translation/translation.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CursorPaginationDto } from './dto/cursor-pagination.dto';
import { ForwardMessageDto } from './dto/forward-message.dto';

const MAX_CONTENT_LENGTH = 2000;
const PREVIEW_LENGTH = 140;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly translation: TranslationService,
  ) {}

  // ── List ────────────────────────────────────────────────────────────────────

  async findAll(conversationId: string, userId: string, pagination: CursorPaginationDto) {
    await this.conversations.assertMember(conversationId, userId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      take: pagination.limit,
      ...(pagination.cursor && { cursor: { id: pagination.cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true, username: true } },
        statuses: { select: { userId: true, status: true } },
        translationsCache: true,
        replyTo: {
          select: {
            id: true,
            content: true,
            type: true,
            mediaUrl: true,
            deletedAt: true,
            sender: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    // Mask deleted message content
    return messages.map((m) => ({
      ...m,
      content: m.deletedAt ? '' : m.content,
      mediaUrl: m.deletedAt ? null : m.mediaUrl,
      isDeleted: !!m.deletedAt,
    }));
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  async create(recipientId: string, senderId: string, dto: CreateMessageDto) {
    if (recipientId === senderId) throw new BadRequestException('Cannot send a message to yourself');

    const content = dto.content ?? '';
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new UnprocessableEntityException(`Content exceeds ${MAX_CONTENT_LENGTH} characters`);
    }

    const type = dto.type ?? MessageType.text;
    if (type === MessageType.text && !content.trim()) {
      throw new BadRequestException('Text message must have content');
    }
    if ((type === MessageType.voice || type === MessageType.image || type === MessageType.video) && !dto.mediaUrl) {
      throw new BadRequestException(`${type} message must have a mediaUrl`);
    }

    const conversationId = await this.findOrCreatePrivateConversation(senderId, recipientId);

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        type,
        content,
        mediaUrl: dto.mediaUrl,
        mediaDuration: dto.mediaDuration,
        replyToId: dto.replyToId,
        lang: dto.lang ?? 'fr',
      },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true, username: true } },
        replyTo: {
          select: {
            id: true, content: true, type: true, mediaUrl: true, deletedAt: true,
            sender: { select: { id: true, displayName: true } },
          },
        },
      },
    });

    const payload = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: message.sender,
      type: message.type,
      content: message.content,
      mediaUrl: message.mediaUrl,
      mediaDuration: message.mediaDuration,
      replyTo: message.replyTo,
      replyToId: message.replyToId,
      statuses: [],
      isDeleted: false,
      createdAt: message.createdAt,
    };

    this.realtime.emitMessage(conversationId, payload);

    if (type === MessageType.text && content.trim()) {
      this.translateForConversation(message.id, conversationId, content, dto.lang ?? 'fr', senderId).catch(
        (err) => this.logger.error(`Translation failed for message ${message.id}: ${err.message}`),
      );
    }

    const preview =
      type === MessageType.voice
        ? '🎤 Message vocal'
        : type === MessageType.image
        ? '📷 Photo'
        : type === MessageType.video
        ? '🎥 Vidéo'
        : content.slice(0, PREVIEW_LENGTH);

    this.notifications
      .sendPushNotification(recipientId, {
        title: message.sender.displayName,
        body: preview,
        data: { conversationId, messageId: message.id },
      })
      .catch((e) => this.logger.error(`Push failed for ${recipientId}: ${e.message}`));

    return payload;
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async delete(messageId: string, userId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId) throw new ForbiddenException('Cannot delete another user\'s message');
    if (message.deletedAt) return { id: messageId, deleted: true };

    await this.prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() } });
    this.realtime.emitMessageDeleted(message.conversationId, messageId);
    return { id: messageId, deleted: true };
  }

  // ── Forward ─────────────────────────────────────────────────────────────────

  async forward(messageId: string, senderId: string, dto: ForwardMessageDto) {
    const original = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!original) throw new NotFoundException('Message not found');
    if (original.deletedAt) throw new BadRequestException('Cannot forward a deleted message');

    const results = await Promise.all(
      dto.recipientIds.map(async (recipientId) => {
        const conversationId = await this.findOrCreatePrivateConversation(senderId, recipientId);
        const msg = await this.prisma.message.create({
          data: {
            conversationId,
            senderId,
            type: original.type,
            content: original.content,
            mediaUrl: original.mediaUrl,
            mediaDuration: original.mediaDuration,
            forwardedFromId: messageId,
            lang: original.lang,
          },
          include: {
            sender: { select: { id: true, displayName: true, avatarUrl: true, username: true } },
          },
        });
        const payload = {
          id: msg.id,
          conversationId,
          senderId: msg.senderId,
          sender: msg.sender,
          type: msg.type,
          content: msg.content,
          mediaUrl: msg.mediaUrl,
          mediaDuration: msg.mediaDuration,
          forwardedFromId: messageId,
          statuses: [],
          isDeleted: false,
          createdAt: msg.createdAt,
        };
        this.realtime.emitMessage(conversationId, payload);
        return payload;
      }),
    );

    return results;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async translateForConversation(
    messageId: string,
    conversationId: string,
    text: string,
    sourceLang: string,
    senderId: string,
  ): Promise<void> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: senderId } },
      include: { user: { select: { language: true } } },
    });
    const targetLangs = [...new Set(members.map((m) => m.user.language as string).filter((l) => l !== sourceLang))];
    await Promise.all(
      targetLangs.map(async (targetLang) => {
        const { translatedText } = await this.translation.translate({ messageId, text, targetLang });
        this.realtime.emitTranslation(conversationId, { messageId, lang: targetLang, translatedText });
      }),
    );
  }

  private async findOrCreatePrivateConversation(senderId: string, recipientId: string): Promise<string> {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.private,
        AND: [
          { members: { some: { userId: senderId } } },
          { members: { some: { userId: recipientId } } },
        ],
      },
    });
    if (existing) return existing.id;
    const created = await this.prisma.conversation.create({
      data: {
        type: ConversationType.private,
        createdBy: senderId,
        members: { create: [{ userId: senderId, role: 'admin' }, { userId: recipientId, role: 'member' }] },
      },
    });
    return created.id;
  }
}
