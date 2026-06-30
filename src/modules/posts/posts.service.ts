import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PostStatus, PostVisibility, PostImageStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UploadService } from '../../common/upload/upload.service';
import { RekognitionService } from '../../common/rekognition/rekognition.service';
import { CreatePostDto } from './dto/create-post.dto';
import { POST_FANOUT_QUEUE, PERSPECTIVE_TOXICITY_THRESHOLD } from './posts.constants';
import type { FanoutJobData } from './queues/fanout.processor';

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly uploadService: UploadService,
    private readonly rekognition: RekognitionService,
    @InjectQueue(POST_FANOUT_QUEUE) private readonly fanoutQueue: Queue,
  ) {}

  async create(authorId: string, dto: CreatePostDto) {
    const mentionedIds = await this.resolveMentions(dto.content ?? '', dto.mentions ?? []);

    const post = await this.prisma.post.create({
      data: {
        authorId,
        content: dto.content ?? '',
        visibility: dto.visibility,
        status: PostStatus.published,
        mentions: {
          create: mentionedIds.map((mentionedUserId) => ({ mentionedUserId })),
        },
        images: dto.images?.length
          ? {
              create: dto.images.map((img) => ({
                s3Key: img.s3Key,
                cdnUrl: this.buildCdnUrl(img.s3Key),
                altText: img.altText,
                order: img.order,
                status: PostImageStatus.pending_review,
              })),
            }
          : undefined,
      },
      include: {
        author: { select: { id: true, displayName: true, avatarUrl: true } },
        mentions: { include: { mentionedUser: { select: { id: true, displayName: true } } } },
        images: { orderBy: { order: 'asc' } },
      },
    });

    await this.fanoutQueue.add(
      'fanout',
      { postId: post.id, authorId, visibility: dto.visibility } satisfies FanoutJobData,
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    // Fire-and-forget: text moderation + image moderation run concurrently
    this.moderateTextAsync(post.id, dto.content ?? '', authorId).catch((err) =>
      this.logger.error(`Text moderation error for post ${post.id}: ${err.message}`),
    );

    if (dto.images?.length) {
      this.moderateImagesAsync(post.id, post.images as { id: string; s3Key: string }[], authorId).catch(
        (err) => this.logger.error(`Image moderation error for post ${post.id}: ${err.message}`),
      );
    }

    return post;
  }

  async generateUploadUrl(filename: string, contentType: string) {
    return this.uploadService.createPostImageUploadUrl(filename, contentType);
  }

  async findOneForUser(postId: string, requesterId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        author: true,
        mentions: true,
        images: { orderBy: { order: 'asc' } },
      },
    });

    if (!post) throw new NotFoundException('Post not found');
    if (post.visibility === PostVisibility.private && post.authorId !== requesterId) {
      throw new ForbiddenException('This post is private');
    }

    return post;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildCdnUrl(s3Key: string): string {
    const supabaseUrl = this.config.get<string>('supabase.url')!;
    const bucket = this.config.get<string>('storage.bucket')!;
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${s3Key}`;
  }

  private async resolveMentions(content: string, explicitIds: string[]): Promise<string[]> {
    const handleMatches = [...content.matchAll(/@([a-zA-Z0-9_]{2,30})/g)].map((m) => m[1]);

    const resolved =
      handleMatches.length > 0
        ? await this.prisma.profile.findMany({
            where: { displayName: { in: handleMatches } },
            select: { id: true },
          })
        : [];

    const all = new Set([...explicitIds, ...resolved.map((p) => p.id)]);
    return [...all].slice(0, 10);
  }

  private async moderateTextAsync(
    postId: string,
    content: string,
    _authorId: string,
  ): Promise<void> {
    const apiKey = this.config.get<string>('perspective.apiKey');
    if (!apiKey || !content) return;

    const response = await axios.post(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
      {
        comment: { text: content },
        languages: ['fr', 'en'],
        requestedAttributes: { TOXICITY: {} },
      },
      { timeout: 5000 },
    );

    const score: number =
      response.data?.attributeScores?.TOXICITY?.summaryScore?.value ?? 0;

    if (score >= PERSPECTIVE_TOXICITY_THRESHOLD) {
      await this.prisma.post.update({
        where: { id: postId },
        data: { status: PostStatus.under_review },
      });
      this.logger.warn(`Post ${postId} text flagged under_review (score: ${score.toFixed(2)})`);
    }
  }

  private async moderateImagesAsync(
    postId: string,
    images: { id: string; s3Key: string }[],
    _authorId: string,
  ): Promise<void> {
    const bucket = this.config.get<string>('storage.bucket')!;
    let postRejected = false;

    for (const image of images) {
      const nsfw = await this.rekognition.isNsfw(bucket, image.s3Key);

      if (nsfw) {
        await this.uploadService.deleteObject(image.s3Key);
        await this.prisma.postImage.update({
          where: { id: image.id },
          data: { status: PostImageStatus.rejected },
        });
        postRejected = true;
        this.logger.warn(`Image ${image.s3Key} rejected — NSFW content detected`);
      } else {
        await this.prisma.postImage.update({
          where: { id: image.id },
          data: { status: PostImageStatus.approved },
        });
      }
    }

    if (postRejected) {
      await this.prisma.post.update({
        where: { id: postId },
        data: { status: PostStatus.removed },
      });
      this.logger.warn(`Post ${postId} removed — NSFW image detected`);
      // Notification auteur : hook futur NotificationsModule
    }
  }
}
