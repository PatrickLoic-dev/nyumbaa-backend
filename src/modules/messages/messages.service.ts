import {
  BadRequestException,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConversationType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CursorPaginationDto } from './dto/cursor-pagination.dto';

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
  ) {}

  async findAll(
    conversationId: string,
    userId: string,
    pagination: CursorPaginationDto,
  ) {
    await this.conversations.assertMember(conversationId, userId);

    return this.prisma.message.findMany({
      where: { conversationId },
      take: pagination.limit,
      ...(pagination.cursor && {
        cursor: { id: pagination.cursor },
        skip: 1,
      }),
      orderBy: { createdAt: 'desc' },
      include: {
        sender: true,
        statuses: true,
        translationsCache: true,
      },
    });
  }

  async create(recipientId: string, senderId: string, dto: CreateMessageDto) {
    if (recipientId === senderId) {
      throw new BadRequestException('Cannot send a message to yourself');
    }
    if (dto.content.length > MAX_CONTENT_LENGTH) {
      throw new UnprocessableEntityException(
        `Content exceeds ${MAX_CONTENT_LENGTH} characters`,
      );
    }

    const conversationId = await this.findOrCreatePrivateConversation(
      senderId,
      recipientId,
    );

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        senderId,
        content: dto.content,
        lang: dto.lang ?? 'fr',
      },
      include: { sender: true },
    });

    const payload = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      status: 'sent',
      createdAt: message.createdAt,
    };

    this.realtime.emitMessage(conversationId, payload);

    this.notifications
      .sendPushNotification(recipientId, {
        title: message.sender.displayName,
        body: message.content.slice(0, PREVIEW_LENGTH),
        data: { conversationId, messageId: message.id },
      })
      .catch((error) =>
        this.logger.error(
          `Failed to notify recipient ${recipientId}: ${error.message}`,
        ),
      );

    return payload;
  }

  private async findOrCreatePrivateConversation(
    senderId: string,
    recipientId: string,
  ): Promise<string> {
    const existing = await this.prisma.conversation.findFirst({
      where: {
        type: ConversationType.private,
        members: { every: { userId: { in: [senderId, recipientId] } } },
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
        members: {
          create: [
            { userId: senderId, role: 'admin' },
            { userId: recipientId, role: 'member' },
          ],
        },
      },
    });
    return created.id;
  }
}
