import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async search(q: string, requesterId: string) {
    if (!q || q.trim().length < 1) return [];
    const term = q.trim().toLowerCase();
    const profiles = await this.prisma.profile.findMany({
      where: {
        id: { not: requesterId },
        OR: [
          { username: { contains: term, mode: 'insensitive' } },
          { displayName: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
      take: 8,
    });
    return profiles;
  }

  async findById(id: string, requesterId?: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('User not found');
    const [followersCount, followingCount, followedByMe] = await Promise.all([
      this.prisma.follow.count({ where: { followingId: id } }),
      this.prisma.follow.count({ where: { followerId: id } }),
      requesterId
        ? this.prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: requesterId, followingId: id } },
          })
        : null,
    ]);
    return { ...profile, followersCount, followingCount, followedByMe: !!followedByMe };
  }

  async updateMe(id: string, dto: UpdateProfileDto) {
    return this.prisma.profile.upsert({
      where: { id },
      update: dto,
      create: {
        id,
        displayName: dto.displayName ?? '',
        avatarUrl: dto.avatarUrl,
        language: dto.language ?? 'fr',
        timezone: dto.timezone ?? 'UTC',
      },
    });
  }

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) throw new BadRequestException('Cannot follow yourself');
    await this.prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: { followerId, followingId },
      update: {},
    });
    const count = await this.prisma.follow.count({ where: { followingId } });
    return { followingId, followed: true, followersCount: count };
  }

  async unfollow(followerId: string, followingId: string) {
    await this.prisma.follow.deleteMany({ where: { followerId, followingId } });
    const count = await this.prisma.follow.count({ where: { followingId } });
    return { followingId, followed: false, followersCount: count };
  }

  async getFollowers(id: string, requesterId?: string) {
    const follows = await this.prisma.follow.findMany({
      where: { followingId: id },
      include: { follower: { select: { id: true, displayName: true, avatarUrl: true, username: true, bio: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const ids = follows.map((f) => f.followerId);
    const myFollowing = requesterId
      ? await this.prisma.follow.findMany({ where: { followerId: requesterId, followingId: { in: ids } } })
      : [];
    const myFollowingSet = new Set(myFollowing.map((f) => f.followingId));
    return follows.map((f) => ({ ...f.follower, followedByMe: myFollowingSet.has(f.follower.id) }));
  }

  async getFollowing(id: string, requesterId?: string) {
    const follows = await this.prisma.follow.findMany({
      where: { followerId: id },
      include: { following: { select: { id: true, displayName: true, avatarUrl: true, username: true, bio: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const ids = follows.map((f) => f.followingId);
    const myFollowing = requesterId
      ? await this.prisma.follow.findMany({ where: { followerId: requesterId, followingId: { in: ids } } })
      : [];
    const myFollowingSet = new Set(myFollowing.map((f) => f.followingId));
    return follows.map((f) => ({ ...f.following, followedByMe: myFollowingSet.has(f.following.id) }));
  }

  async getUserPosts(userId: string, requesterId?: string) {
    const posts = await this.prisma.post.findMany({
      where: { authorId: userId, status: 'published' },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true, username: true } },
        images: { orderBy: { order: 'asc' } },
        _count: { select: { comments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const myLikes = requesterId
      ? await this.prisma.like.findMany({ where: { userId: requesterId, postId: { in: posts.map((p) => p.id) } } })
      : [];
    const likedSet = new Set(myLikes.map((l) => l.postId));
    return posts.map((p) => ({
      ...p,
      commentsCount: p._count.comments,
      likedByMe: likedSet.has(p.id),
    }));
  }

  async sendPhoneOtp(userJwt: string, phone: string): Promise<void> {
    const { error } = await this.supabase.forUser(userJwt).auth.updateUser({ phone });
    if (error) {
      throw new InternalServerErrorException('Failed to send OTP. Phone auth may not be enabled.');
    }
  }

  async verifyPhoneOtp(
    userJwt: string,
    userId: string,
    phone: string,
    token: string,
  ): Promise<void> {
    const { error } = await this.supabase.forUser(userJwt).auth.verifyOtp({
      phone,
      token,
      type: 'phone_change',
    });

    if (error) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.prisma.profile.update({
      where: { id: userId },
      data: { phoneNumber: phone, phoneVerified: true },
    });
  }
}
