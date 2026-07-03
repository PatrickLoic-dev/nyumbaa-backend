import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConversationType } from '@prisma/client';
import { MessagesService } from '../messages.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ConversationsService } from '../../conversations/conversations.service';

const SENDER_ID = 'sender-uuid';
const RECIPIENT_ID = 'recipient-uuid';
const CONVERSATION_ID = 'conversation-uuid';
const MESSAGE_ID = 'message-uuid';

const mockMessage = {
  id: MESSAGE_ID,
  conversationId: CONVERSATION_ID,
  senderId: SENDER_ID,
  content: 'Hello',
  lang: 'fr',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  conversation: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  message: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockConversationsService = {
  assertMember: jest.fn(),
};

describe('MessagesService', () => {
  let service: MessagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConversationsService, useValue: mockConversationsService },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
    jest.clearAllMocks();
    mockPrisma.conversation.findFirst.mockResolvedValue(null);
    mockPrisma.conversation.create.mockResolvedValue({ id: CONVERSATION_ID });
    mockPrisma.message.create.mockResolvedValue(mockMessage);
  });

  describe('create', () => {
    it('rejects sending a message to yourself', async () => {
      await expect(
        service.create(SENDER_ID, SENDER_ID, { content: 'Hi' }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('rejects content over 2000 characters', async () => {
      await expect(
        service.create(RECIPIENT_ID, SENDER_ID, { content: 'a'.repeat(2001) }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('creates a private conversation when none exists yet', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue(null);

      const result = await service.create(RECIPIENT_ID, SENDER_ID, {
        content: 'Hello',
      });

      expect(mockPrisma.conversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: ConversationType.private }),
        }),
      );
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            conversationId: CONVERSATION_ID,
            senderId: SENDER_ID,
          }),
        }),
      );
      expect(result).toEqual({
        id: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        senderId: SENDER_ID,
        content: mockMessage.content,
        status: 'sent',
        createdAt: mockMessage.createdAt,
      });
    });

    it('reuses an existing private conversation instead of creating a new one', async () => {
      mockPrisma.conversation.findFirst.mockResolvedValue({
        id: CONVERSATION_ID,
      });

      await service.create(RECIPIENT_ID, SENDER_ID, { content: 'Hello again' });

      expect(mockPrisma.conversation.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ conversationId: CONVERSATION_ID }),
        }),
      );
    });

    it('defaults lang to fr when not provided', async () => {
      await service.create(RECIPIENT_ID, SENDER_ID, { content: 'Hello' });

      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lang: 'fr' }),
        }),
      );
    });
  });
});
