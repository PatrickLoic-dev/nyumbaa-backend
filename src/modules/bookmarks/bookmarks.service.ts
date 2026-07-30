import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class BookmarksService {
  constructor(private readonly prisma: PrismaService) {}

  async bookmark(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new NotFoundException('Post not found');

    await this.prisma.postBookmark.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: {},
    });
    return { postId, bookmarked: true };
  }

  async unbookmark(userId: string, postId: string) {
    await this.prisma.postBookmark.deleteMany({ where: { postId, userId } });
    return { postId, bookmarked: false };
  }

  async getBookmarks(userId: string) {
    const bookmarks = await this.prisma.postBookmark.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          include: {
            author: { select: { id: true, displayName: true, avatarUrl: true, username: true } },
            images: { orderBy: { order: 'asc' } },
            videos: { orderBy: { order: 'asc' } },
            _count: { select: { comments: true } },
            likes: { where: { userId }, select: { userId: true } },
            reposts: { where: { userId }, select: { userId: true } },
          },
        },
      },
    });

    return bookmarks.map((b) => ({
      ...b.post,
      likedByMe: b.post.likes.length > 0,
      repostedByMe: b.post.reposts.length > 0,
      bookmarkedByMe: true,
      repostedBy: null,
      commentsCount: b.post._count.comments,
      likes: undefined,
      reposts: undefined,
      _count: undefined,
    }));
  }
}
