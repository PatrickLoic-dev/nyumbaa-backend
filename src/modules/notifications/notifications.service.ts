import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { MailService } from '../mail/mail.service';
import { RegisterTokenDto } from './dto/register-token.dto';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly expo: Expo;
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {
    this.expo = new Expo({
      accessToken: this.config.get<string>('expo.accessToken'),
    });
  }

  async registerToken(userId: string, dto: RegisterTokenDto) {
    return this.prisma.pushToken.upsert({
      where: {
        userId_platform: {
          userId,
          platform: dto.platform,
        },
      },
      update: { expoToken: dto.expoToken },
      create: {
        userId,
        expoToken: dto.expoToken,
        platform: dto.platform,
      },
    });
  }

  /**
   * Sends a push notification to every device registered for a user.
   * Falls back to email (via Resend) when the user has no valid push token,
   * or when Expo immediately rejects every message for that user.
   */
  async sendPushNotification(userId: string, payload: PushNotificationPayload) {
    const tokens = await this.prisma.pushToken.findMany({ where: { userId } });
    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t.expoToken));

    if (validTokens.length === 0) {
      await this.fallbackToEmail(userId, payload);
      return;
    }

    const messages: ExpoPushMessage[] = validTokens.map((t) => ({
      to: t.expoToken,
      title: payload.title,
      body: payload.body,
      data: payload.data,
    }));

    const tickets: ExpoPushTicket[] = [];
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        tickets.push(...(await this.expo.sendPushNotificationsAsync(chunk)));
      } catch (error) {
        this.logger.error(`Expo push send failed: ${(error as Error).message}`);
      }
    }

    await this.pruneStaleTokens(validTokens, tickets);

    const allFailed =
      tickets.length === 0 || tickets.every((t) => t.status === 'error');
    if (allFailed) {
      await this.fallbackToEmail(userId, payload);
    }
  }

  private async pruneStaleTokens(
    tokens: { id: string; expoToken: string }[],
    tickets: ExpoPushTicket[],
  ) {
    const staleTokenIds = tickets
      .map((ticket, index) =>
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
          ? tokens[index]?.id
          : undefined,
      )
      .filter((id): id is string => Boolean(id));

    if (staleTokenIds.length > 0) {
      await this.prisma.pushToken.deleteMany({
        where: { id: { in: staleTokenIds } },
      });
    }
  }

  private async fallbackToEmail(
    userId: string,
    payload: PushNotificationPayload,
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: userId },
    });
    if (!profile?.emailNotificationsEnabled) return;

    const { data, error } =
      await this.supabase.admin.auth.admin.getUserById(userId);
    if (error || !data.user?.email) {
      this.logger.warn(
        `Cannot send fallback email: no address for user ${userId}`,
      );
      return;
    }

    await this.mail.sendMessageNotification(
      data.user.email,
      payload.title,
      payload.body,
    );
  }
}
