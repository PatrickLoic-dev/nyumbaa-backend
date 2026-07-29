import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { ForwardMessageDto } from './dto/forward-message.dto';
import { CursorPaginationDto } from './dto/cursor-pagination.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConversationMemberGuard } from '../../common/guards/conversation-member.guard';
import { User } from '@supabase/supabase-js';

@ApiTags('messages')
@ApiBearerAuth()
@Controller('conversations/:id/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @ApiOperation({ summary: 'List messages in a conversation (cursor-based pagination)' })
  findAll(
    @Param('id') conversationId: string,
    @CurrentUser() user: User,
    @Query() pagination: CursorPaginationDto,
  ) {
    return this.messagesService.findAll(conversationId, user.id, pagination);
  }

  @Post()
  @UseGuards(ConversationMemberGuard)
  @ApiOperation({ summary: 'Send a message (text, voice, image, video) to a user' })
  create(
    @Param('id') recipientId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(recipientId, user.id, dto);
  }

  @Delete(':messageId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a message (replaces content with tombstone)' })
  delete(@Param('messageId') messageId: string, @CurrentUser() user: User) {
    return this.messagesService.delete(messageId, user.id);
  }

  @Post(':messageId/forward')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Forward a message to one or more recipients' })
  forward(
    @Param('messageId') messageId: string,
    @CurrentUser() user: User,
    @Body() dto: ForwardMessageDto,
  ) {
    return this.messagesService.forward(messageId, user.id, dto);
  }
}
