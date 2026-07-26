import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Validates the `:id` route param as a messaging target before the handler runs:
 * the recipient's profile must exist, and their Supabase auth account must not
 * be banned. `banned_until` isn't part of supabase-js's typed User, but GoTrue
 * returns it on admin lookups, hence the local cast.
 */
@Injectable()
export class ConversationMemberGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const recipientId = request.params.id as string;

    const recipient = await this.prisma.profile.findUnique({
      where: { id: recipientId },
    });
    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    const { data, error } =
      await this.supabase.admin.auth.admin.getUserById(recipientId);
    if (error || !data.user) {
      throw new NotFoundException('Recipient not found');
    }

    const bannedUntil = (data.user as { banned_until?: string }).banned_until;
    if (bannedUntil && new Date(bannedUntil) > new Date()) {
      throw new ForbiddenException('Recipient account is banned');
    }

    return true;
  }
}
