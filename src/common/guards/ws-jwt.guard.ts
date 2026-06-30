import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient<Socket>();
    const token = this.extractToken(client);

    if (!token) {
      throw new WsException('Missing Bearer token');
    }

    const { data, error } = await this.supabase.admin.auth.getUser(token);

    if (error || !data.user) {
      throw new WsException('Invalid or expired token');
    }

    (client as Socket & { user: typeof data.user }).user = data.user;
    return true;
  }

  private extractToken(client: Socket): string | null {
    const auth =
      (client.handshake.auth as Record<string, string>)['token'] ??
      client.handshake.headers['authorization'];

    if (!auth) return null;
    return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  }
}
