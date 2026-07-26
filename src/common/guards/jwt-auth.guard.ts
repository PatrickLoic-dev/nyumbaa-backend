import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { createHash } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { RedisService } from '../redis/redis.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { User } from '@supabase/supabase-js';

const CACHE_TTL_SECONDS = 5 * 60;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly redis: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    const user = await this.resolveUser(token);
    (request as Request & { user: User }).user = user;
    return true;
  }

  private async resolveUser(token: string): Promise<User> {
    // Hash token before using as cache key — never store raw JWTs in Redis
    const cacheKey = `jwt:user:${createHash('sha256').update(token).digest('hex')}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as User;
      } catch {
        // Corrupted cache entry — fall through to Supabase
      }
    }

    const { data, error } = await this.supabase.admin.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Redis TTL handles expiry automatically — no manual cleanup needed
    await this.redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(data.user));

    return data.user;
  }

  private extractBearerToken(request: Request): string | null {
    const auth = request.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    return auth.slice(7);
  }
}
