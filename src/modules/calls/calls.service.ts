import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

@Injectable()
export class CallsService {
  constructor(private readonly config: ConfigService) {}

  async generateToken(userId: string, conversationId: string, displayName: string) {
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY') ?? '';
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET') ?? '';
    const wsUrl = this.config.get<string>('LIVEKIT_WS_URL') ?? '';

    const token = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: displayName,
      ttl: '1h',
    });

    token.addGrant({
      roomJoin: true,
      room: conversationId,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return {
      token: await token.toJwt(),
      wsUrl,
      room: conversationId,
    };
  }
}
