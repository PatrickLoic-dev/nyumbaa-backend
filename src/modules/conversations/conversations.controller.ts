import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

@ApiTags('conversations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List conversations for current user' })
  findAll(@CurrentUser() user: User) {
    return this.conversationsService.findAll(user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new conversation' })
  create(@CurrentUser() user: User, @Body() dto: CreateConversationDto) {
    return this.conversationsService.create(user.id, dto);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a member to a conversation' })
  addMember(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: AddMemberDto,
  ) {
    return this.conversationsService.addMember(id, user.id, dto.userId);
  }
}
