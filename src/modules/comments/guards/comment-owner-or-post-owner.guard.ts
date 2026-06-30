import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { Request } from 'express';
import { User } from '@supabase/supabase-js';

@Injectable()
export class CommentOwnerOrPostOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user: User }>();
    const userId = request.user.id;
    const commentId = request.params['id'] as string;

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      include: { post: { select: { authorId: true } } },
    }) as ({ post: { authorId: string } } & { authorId: string }) | null;

    if (!comment) throw new NotFoundException({ error: 'POST_NOT_FOUND' });

    const isCommentAuthor = comment.authorId === userId;
    const isPostAuthor = comment.post.authorId === userId;

    if (!isCommentAuthor && !isPostAuthor) {
      throw new ForbiddenException({ error: 'FORBIDDEN' });
    }

    return true;
  }
}
