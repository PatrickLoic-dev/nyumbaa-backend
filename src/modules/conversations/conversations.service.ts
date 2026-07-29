import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

const MEMBER_INCLUDE = {
  include: {
    user: {
      select: { id: true, displayName: true, avatarUrl: true, username: true },
    },
  },
};

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            members: MEMBER_INCLUDE,
            messages: {
              orderBy: { createdAt: 'desc' as const },
              take: 1,
              include: { sender: { select: { id: true, displayName: true } } },
            },
          },
        },
      },
    });

    return memberships
      .map((m) => ({
        ...m.conversation,
        myRole: m.role,
        isFavorite: m.isFavorite,
        isPinned: m.isPinned,
        wallpaper: m.wallpaper,
      }))
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }

  async findOne(conversationId: string, userId: string) {
    const membership = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!membership) throw new ForbiddenException('Not a member of this conversation');

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: MEMBER_INCLUDE },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    return {
      ...conversation,
      myRole: membership.role,
      isFavorite: membership.isFavorite,
      isPinned: membership.isPinned,
      wallpaper: membership.wallpaper,
    };
  }

  async create(userId: string, dto: CreateConversationDto) {
    const memberIds = [...new Set([userId, ...dto.memberIds])];
    return this.prisma.conversation.create({
      data: {
        type: dto.type,
        name: dto.name,
        avatarUrl: (dto as any).avatarUrl,
        createdBy: userId,
        members: {
          create: memberIds.map((id) => ({
            userId: id,
            role: id === userId ? 'admin' : 'member',
          })),
        },
      },
      include: { members: MEMBER_INCLUDE },
    });
  }

  async update(conversationId: string, userId: string, data: { name?: string; avatarUrl?: string }) {
    await this.assertAdmin(conversationId, userId);
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data,
      include: { members: MEMBER_INCLUDE },
    });
  }

  async addMember(conversationId: string, requesterId: string, userId: string) {
    await this.assertMember(conversationId, requesterId);
    return this.prisma.conversationMember.create({
      data: { conversationId, userId },
    });
  }

  async removeMember(conversationId: string, requesterId: string, userId: string) {
    const requester = await this.assertMember(conversationId, requesterId);
    if (requesterId !== userId && requester.role !== 'admin') {
      throw new ForbiddenException('Only admins can remove other members');
    }
    return this.prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId, userId } },
    });
  }

  async toggleFavorite(conversationId: string, userId: string) {
    const m = await this.assertMember(conversationId, userId);
    const updated = await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isFavorite: !m.isFavorite },
    });
    return { conversationId, isFavorite: updated.isFavorite };
  }

  async togglePin(conversationId: string, userId: string) {
    const m = await this.assertMember(conversationId, userId);
    const updated = await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { isPinned: !m.isPinned },
    });
    return { conversationId, isPinned: updated.isPinned };
  }

  async setWallpaper(conversationId: string, userId: string, wallpaper: string | null) {
    await this.assertMember(conversationId, userId);
    await this.prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { wallpaper },
    });
    return { conversationId, wallpaper };
  }

  async assertMember(conversationId: string, userId: string) {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');
    return member;
  }

  private async assertAdmin(conversationId: string, userId: string) {
    const member = await this.assertMember(conversationId, userId);
    if (member.role !== 'admin') throw new ForbiddenException('Only admins can do this');
    return member;
  }
}
