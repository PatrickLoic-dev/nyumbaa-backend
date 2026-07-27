import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCommunityDto } from './dto/create-community.dto';

@Injectable()
export class CommunitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const communities = await this.prisma.community.findMany({
      orderBy: { memberCount: 'desc' },
      include: {
        members: { where: { userId }, select: { userId: true } },
      },
    });
    return communities.map((c) => ({
      ...c,
      joinedByMe: c.members.length > 0,
      members: undefined,
    }));
  }

  async create(userId: string, dto: CreateCommunityDto) {
    return this.prisma.community.create({
      data: {
        name: dto.name,
        description: dto.description,
        avatarUrl: dto.avatarUrl,
        createdBy: userId,
        members: { create: { userId } },
        memberCount: 1,
      },
    });
  }

  async join(communityId: string, userId: string) {
    const community = await this.prisma.community.findUnique({ where: { id: communityId } });
    if (!community) throw new NotFoundException('Community not found');

    const existing = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (existing) throw new ConflictException('Already a member');

    await this.prisma.$transaction([
      this.prisma.communityMember.create({ data: { communityId, userId } }),
      this.prisma.community.update({
        where: { id: communityId },
        data: { memberCount: { increment: 1 } },
      }),
    ]);

    return { communityId, joined: true };
  }

  async leave(communityId: string, userId: string) {
    const existing = await this.prisma.communityMember.findUnique({
      where: { communityId_userId: { communityId, userId } },
    });
    if (!existing) throw new NotFoundException('Not a member');

    await this.prisma.$transaction([
      this.prisma.communityMember.delete({
        where: { communityId_userId: { communityId, userId } },
      }),
      this.prisma.community.update({
        where: { id: communityId },
        data: { memberCount: { decrement: 1 } },
      }),
    ]);

    return { communityId, joined: false };
  }
}
