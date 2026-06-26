import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CursorPaginationDto } from './dto/cursor-pagination.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {}

  async findAll(conversationId: string, userId: string, pagination: CursorPaginationDto) {
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

  async create(conversationId: string, userId: string, dto: CreateMessageDto) {
    await this.conversations.assertMember(conversationId, userId);

    return this.prisma.message.create({
      data: {
        conversationId,
        senderId: userId,
        content: dto.content,
        lang: dto.lang ?? 'fr',
      },
      include: { sender: true },
    });
  }
}
