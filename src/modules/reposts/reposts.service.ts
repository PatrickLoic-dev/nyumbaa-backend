import { Injectable, NotFoundException } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class RepostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
  ) {}

  async repost(postId: string, userId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, status: true },
    });
    if (!post || post.status === PostStatus.removed) {
      throw new NotFoundException({ error: 'POST_NOT_FOUND' });
    }

    try {
      await this.prisma.repost.create({ data: { postId, userId } });
      await this.prisma.post.update({
        where: { id: postId },
        data: { repostsCount: { increment: 1 } },
      });
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        // Already reposted — idempotent
        const count = await this.prisma.repost.count({ where: { postId } });
        return { postId, reposted: true, repostsCount: count };
      }
      throw err;
    }

    const repostsCount = await this.prisma.repost.count({ where: { postId } });
    this.realtime.emitPostUpdated(postId, { repostsCount } as never);
    return { postId, reposted: true, repostsCount };
  }

  async unrepost(postId: string, userId: string) {
    await this.prisma.repost.deleteMany({ where: { postId, userId } });
    await this.prisma.post.update({
      where: { id: postId },
      data: { repostsCount: { decrement: 1 } },
    });

    const repostsCount = await this.prisma.repost.count({ where: { postId } });
    this.realtime.emitPostUpdated(postId, { repostsCount } as never);
    return { postId, reposted: false, repostsCount };
  }
}
