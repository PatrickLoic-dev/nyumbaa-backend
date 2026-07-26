import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
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
  @ApiOperation({
    summary: 'List messages in a conversation (cursor-based pagination)',
  })
  findAll(
    @Param('id') conversationId: string,
    @CurrentUser() user: User,
    @Query() pagination: CursorPaginationDto,
  ) {
    return this.messagesService.findAll(conversationId, user.id, pagination);
  }

  @Post()
  @UseGuards(ConversationMemberGuard)
  @ApiOperation({
    summary:
      'Send a message to a user, creating a private conversation if needed',
  })
  create(
    @Param('id') recipientId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(recipientId, user.id, dto);
  }
}
