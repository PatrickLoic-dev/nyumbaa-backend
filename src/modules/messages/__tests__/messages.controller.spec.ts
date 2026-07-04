import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { MessagesModule } from '../messages.module';
import { PrismaModule } from '../../../common/prisma/prisma.module';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SupabaseModule } from '../../../common/supabase/supabase.module';
import { SupabaseService } from '../../../common/supabase/supabase.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';

const SENDER_ID = 'sender-uuid';
const RECIPIENT_ID = 'recipient-uuid';
const CONVERSATION_ID = 'conversation-uuid';

/** Stands in for the global JwtAuthGuard, which isn't wired up outside AppModule. */
class FakeJwtAuthGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    request.user = { id: SENDER_ID };
    return true;
  }
}

const mockPrisma = {
  profile: { findUnique: jest.fn() },
  conversation: { findFirst: jest.fn(), create: jest.fn() },
  message: { create: jest.fn(), findMany: jest.fn() },
  conversationMember: { findUnique: jest.fn() },
};

const mockSupabase = {
  admin: { auth: { admin: { getUserById: jest.fn() } } },
};

const mockRealtimeGateway = {
  emitMessage: jest.fn(),
};

describe('MessagesController (POST /conversations/:id/messages)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule, SupabaseModule, MessagesModule],
      providers: [{ provide: APP_GUARD, useClass: FakeJwtAuthGuard }],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(SupabaseService)
      .useValue(mockSupabase)
      .overrideProvider(RealtimeGateway)
      .useValue(mockRealtimeGateway)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.profile.findUnique.mockResolvedValue({ id: RECIPIENT_ID });
    mockSupabase.admin.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: RECIPIENT_ID } },
      error: null,
    });
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: CONVERSATION_ID });
    mockPrisma.message.create.mockResolvedValue({
      id: 'message-uuid',
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: 'Hello there',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('returns 201 with the created message on the happy path', async () => {
    const res = await request(app.getHttpServer())
      .post(`/conversations/${RECIPIENT_ID}/messages`)
      .send({ content: 'Hello there' })
      .expect(201);

    expect(res.body).toMatchObject({
      id: 'message-uuid',
      conversationId: CONVERSATION_ID,
      senderId: SENDER_ID,
      content: 'Hello there',
      status: 'sent',
    });
    expect(mockRealtimeGateway.emitMessage).toHaveBeenCalledWith(
      CONVERSATION_ID,
      expect.objectContaining({ id: 'message-uuid', status: 'sent' }),
    );
  });

  it('returns 400 for empty content', async () => {
    await request(app.getHttpServer())
      .post(`/conversations/${RECIPIENT_ID}/messages`)
      .send({ content: '' })
      .expect(400);
  });

  it('returns 400 when messaging yourself', async () => {
    await request(app.getHttpServer())
      .post(`/conversations/${SENDER_ID}/messages`)
      .send({ content: 'Hello me' })
      .expect(400);
  });

  it('returns 404 when the recipient does not exist', async () => {
    mockPrisma.profile.findUnique.mockResolvedValue(null);

    await request(app.getHttpServer())
      .post(`/conversations/${RECIPIENT_ID}/messages`)
      .send({ content: 'Hello there' })
      .expect(404);
  });

  it('returns 403 when the recipient is banned', async () => {
    mockSupabase.admin.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: RECIPIENT_ID,
          banned_until: new Date(Date.now() + 60_000).toISOString(),
        },
      },
      error: null,
    });

    await request(app.getHttpServer())
      .post(`/conversations/${RECIPIENT_ID}/messages`)
      .send({ content: 'Hello there' })
      .expect(403);
  });

  it('returns 422 when content exceeds 2000 characters', async () => {
    await request(app.getHttpServer())
      .post(`/conversations/${RECIPIENT_ID}/messages`)
      .send({ content: 'a'.repeat(2001) })
      .expect(422);
  });
});
