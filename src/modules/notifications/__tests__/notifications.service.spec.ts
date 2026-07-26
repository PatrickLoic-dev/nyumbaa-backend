import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { MailService } from '../../mail/mail.service';

const USER_ID = 'user-uuid';
const VALID_TOKEN = 'ExponentPushToken[valid-token]';
const OTHER_VALID_TOKEN = 'ExponentPushToken[other-token]';

jest.mock('expo-server-sdk', () => {
  const actual = jest.requireActual('expo-server-sdk');
  return {
    ...actual,
    Expo: class {
      static isExpoPushToken(token: unknown) {
        return actual.Expo.isExpoPushToken(token);
      }
      chunkPushNotifications(messages: unknown[]) {
        return [messages];
      }
      sendPushNotificationsAsync = jest.fn();
    },
  };
});

const mockPrisma = {
  pushToken: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  profile: {
    findUnique: jest.fn(),
  },
};

const mockSupabase = {
  admin: {
    auth: {
      admin: {
        getUserById: jest.fn(),
      },
    },
  },
};

const mockMail = {
  sendMessageNotification: jest.fn(),
};

const mockConfig = {
  get: jest.fn(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: MailService, useValue: mockMail },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  describe('sendPushNotification', () => {
    it('sends via Expo when the user has valid tokens', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([
        {
          id: 'token-1',
          userId: USER_ID,
          expoToken: VALID_TOKEN,
          platform: 'ios',
        },
      ]);
      const sendSpy = jest
        .spyOn((service as any).expo, 'sendPushNotificationsAsync')
        .mockResolvedValue([{ status: 'ok', id: 'receipt-1' }]);

      await service.sendPushNotification(USER_ID, {
        title: 'Alice',
        body: 'Hello',
      });

      expect(sendSpy).toHaveBeenCalledWith([
        expect.objectContaining({
          to: VALID_TOKEN,
          title: 'Alice',
          body: 'Hello',
        }),
      ]);
      expect(mockMail.sendMessageNotification).not.toHaveBeenCalled();
    });

    it('deletes stale tokens reported as DeviceNotRegistered', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([
        {
          id: 'token-1',
          userId: USER_ID,
          expoToken: VALID_TOKEN,
          platform: 'ios',
        },
        {
          id: 'token-2',
          userId: USER_ID,
          expoToken: OTHER_VALID_TOKEN,
          platform: 'android',
        },
      ]);
      jest
        .spyOn((service as any).expo, 'sendPushNotificationsAsync')
        .mockResolvedValue([
          { status: 'ok', id: 'receipt-1' },
          {
            status: 'error',
            message: 'not registered',
            details: { error: 'DeviceNotRegistered' },
          },
        ]);

      await service.sendPushNotification(USER_ID, {
        title: 'Alice',
        body: 'Hello',
      });

      expect(mockPrisma.pushToken.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['token-2'] } },
      });
    });

    it('falls back to email when the user has no push token and email prefs are enabled', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([]);
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: USER_ID,
        emailNotificationsEnabled: true,
      });
      mockSupabase.admin.auth.admin.getUserById.mockResolvedValue({
        data: { user: { email: 'alice@example.com' } },
        error: null,
      });

      await service.sendPushNotification(USER_ID, {
        title: 'Alice',
        body: 'Hello',
      });

      expect(mockMail.sendMessageNotification).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice',
        'Hello',
      );
    });

    it('does not send an email when the user disabled email notifications', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([]);
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: USER_ID,
        emailNotificationsEnabled: false,
      });

      await service.sendPushNotification(USER_ID, {
        title: 'Alice',
        body: 'Hello',
      });

      expect(mockSupabase.admin.auth.admin.getUserById).not.toHaveBeenCalled();
      expect(mockMail.sendMessageNotification).not.toHaveBeenCalled();
    });

    it('falls back to email when every push ticket comes back as an error', async () => {
      mockPrisma.pushToken.findMany.mockResolvedValue([
        {
          id: 'token-1',
          userId: USER_ID,
          expoToken: VALID_TOKEN,
          platform: 'ios',
        },
      ]);
      jest
        .spyOn((service as any).expo, 'sendPushNotificationsAsync')
        .mockResolvedValue([
          {
            status: 'error',
            message: 'boom',
            details: { error: 'ProviderError' },
          },
        ]);
      mockPrisma.profile.findUnique.mockResolvedValue({
        id: USER_ID,
        emailNotificationsEnabled: true,
      });
      mockSupabase.admin.auth.admin.getUserById.mockResolvedValue({
        data: { user: { email: 'alice@example.com' } },
        error: null,
      });

      await service.sendPushNotification(USER_ID, {
        title: 'Alice',
        body: 'Hello',
      });

      expect(mockMail.sendMessageNotification).toHaveBeenCalledWith(
        'alice@example.com',
        'Alice',
        'Hello',
      );
    });
  });
});
