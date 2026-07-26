import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CursorCommentsDto } from './dto/cursor-comments.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CommentOwnerOrPostOwnerGuard } from './guards/comment-owner-or-post-owner.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post('posts/:postId/comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a comment to a post' })
  @ApiCreatedResponse({ description: 'Comment created — moderation async' })
  create(
    @Param('postId') postId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(postId, user.id, dto);
  }

  @Get('posts/:postId/comments')
  @ApiOperation({ summary: 'List comments (cursor-based, ASC order, 10/batch)' })
  @ApiOkResponse({ description: '{ data, nextCursor, hasMore }' })
  findAll(@Param('postId') postId: string, @Query() pagination: CursorCommentsDto) {
    return this.commentsService.findAll(postId, pagination);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CommentOwnerOrPostOwnerGuard)
  @ApiOperation({ summary: 'Delete a comment (comment author or post author only)' })
  @ApiForbiddenResponse({ description: '403 if requester is neither comment nor post author' })
  @ApiNoContentResponse({ description: '204 No Content' })
  remove(@Param('id') id: string) {
    return this.commentsService.remove(id);
  }
}
