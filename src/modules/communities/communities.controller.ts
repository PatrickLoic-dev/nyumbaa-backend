import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { CommunitiesService } from './communities.service';
import { CreateCommunityDto } from './dto/create-community.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

@ApiTags('communities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('communities')
export class CommunitiesController {
  constructor(private readonly service: CommunitiesService) {}

  @Get()
  @ApiOperation({ summary: 'List all communities with joinedByMe flag' })
  @ApiOkResponse({ description: 'Community[]' })
  findAll(@CurrentUser() user: User) {
    return this.service.findAll(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a community' })
  @ApiCreatedResponse({ description: 'Community created' })
  create(@CurrentUser() user: User, @Body() dto: CreateCommunityDto) {
    return this.service.create(user.id, dto);
  }

  @Post(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a community' })
  @ApiOkResponse({ description: '{ communityId, joined: true }' })
  join(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.join(id, user.id);
  }

  @Delete(':id/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a community' })
  @ApiOkResponse({ description: '{ communityId, joined: false }' })
  leave(@Param('id') id: string, @CurrentUser() user: User) {
    return this.service.leave(id, user.id);
  }
}
