import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

class UpdateConversationDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() avatarUrl?: string;
}

class SetWallpaperDto {
  @IsOptional() @IsString() wallpaper?: string | null;
}

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: 'List conversations for current user (pinned first)' })
  findAll(@CurrentUser() user: User) {
    return this.conversationsService.findAll(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation details' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.conversationsService.findOne(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a conversation (private or group)' })
  create(@CurrentUser() user: User, @Body() dto: CreateConversationDto) {
    return this.conversationsService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update group name / avatar (admin only)' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationsService.update(id, user.id, dto);
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

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a member (or leave group)' })
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: User,
  ) {
    return this.conversationsService.removeMember(id, user.id, userId);
  }

  @Patch(':id/favorite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle favorite on a conversation' })
  toggleFavorite(@Param('id') id: string, @CurrentUser() user: User) {
    return this.conversationsService.toggleFavorite(id, user.id);
  }

  @Patch(':id/pin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle pin on a conversation' })
  togglePin(@Param('id') id: string, @CurrentUser() user: User) {
    return this.conversationsService.togglePin(id, user.id);
  }

  @Patch(':id/wallpaper')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set wallpaper for a conversation (per user)' })
  setWallpaper(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: SetWallpaperDto,
  ) {
    return this.conversationsService.setWallpaper(id, user.id, dto.wallpaper ?? null);
  }
}
