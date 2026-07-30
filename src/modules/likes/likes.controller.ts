import {
  Controller,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { LikesService } from './likes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

@ApiTags('likes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posts/:id/like')
export class LikesController {
  constructor(private readonly likesService: LikesService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Like a post (idempotent — 2nd call returns same result)' })
  @ApiOkResponse({ description: '{ postId, liked: true, likesCount }' })
  @ApiNotFoundResponse({ description: '{ error: "POST_NOT_FOUND" }' })
  like(@Param('id', ParseUUIDPipe) postId: string, @CurrentUser() user: User) {
    return this.likesService.like(postId, user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unlike a post' })
  @ApiOkResponse({ description: '{ postId, liked: false, likesCount }' })
  unlike(@Param('id', ParseUUIDPipe) postId: string, @CurrentUser() user: User) {
    return this.likesService.unlike(postId, user.id);
  }
}
