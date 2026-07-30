import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async searchAccounts(q: string, requesterId: string, limit = 20) {
    try {
      return await this.prisma.profile.findMany({
        where: {
          id: { not: requesterId },
          OR: [
            { displayName: { contains: q, mode: 'insensitive' } },
            { username: { contains: q, mode: 'insensitive' } },
            { bio: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, displayName: true, username: true, avatarUrl: true, bio: true },
        take: limit,
      });
    } catch (err) {
      this.logger.warn(`searchAccounts failed: ${(err as Error).message}`);
      return [];
    }
  }

  async searchFeeds(q: string, requesterId: string, limit = 15) {
    try {
      const posts = await this.prisma.post.findMany({
        where: {
          visibility: 'public',
          status: 'published',
          content: { contains: q, mode: 'insensitive' },
        },
        include: {
          author: { select: { id: true, displayName: true, avatarUrl: true, username: true } },
          images: { orderBy: { order: 'asc' }, take: 1 },
          _count: { select: { comments: true } },
          likes: { where: { userId: requesterId }, select: { userId: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return posts.map((p) => ({
        ...p,
        likedByMe: p.likes.length > 0,
        commentsCount: p._count.comments,
        likes: undefined,
        _count: undefined,
      }));
    } catch (err) {
      this.logger.warn(`searchFeeds failed: ${(err as Error).message}`);
      return [];
    }
  }

  async searchCommunities(q: string, userId: string, limit = 20) {
    try {
      const communities = await this.prisma.community.findMany({
        where: {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: { members: { where: { userId }, select: { userId: true } } },
        take: limit,
      });
      return communities.map((c) => ({
        ...c,
        joinedByMe: c.members.length > 0,
        members: undefined,
      }));
    } catch (err) {
      this.logger.warn(`searchCommunities failed: ${(err as Error).message}`);
      return [];
    }
  }

  async searchUsers(q: string, requesterId: string, limit = 20) {
    return this.searchAccounts(q, requesterId, limit);
  }

  async popularTopics() {
    const profiles = await this.prisma.profile.findMany({ select: { interests: true } });
    const counts: Record<string, number> = {};
    for (const p of profiles) {
      for (const i of p.interests) counts[i] = (counts[i] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label]) => ({ label }));
  }
}
