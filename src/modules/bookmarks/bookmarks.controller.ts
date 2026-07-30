import { Controller, Post, Delete, Get, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { BookmarksService } from './bookmarks.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

@ApiTags('bookmarks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class BookmarksController {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Post('posts/:id/bookmark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bookmark a post' })
  bookmark(@CurrentUser() user: User, @Param('id') postId: string) {
    return this.bookmarksService.bookmark(user.id, postId);
  }

  @Delete('posts/:id/bookmark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove bookmark from a post' })
  unbookmark(@CurrentUser() user: User, @Param('id') postId: string) {
    return this.bookmarksService.unbookmark(user.id, postId);
  }

  @Get('bookmarks')
  @ApiOperation({ summary: 'Get my bookmarked posts' })
  getBookmarks(@CurrentUser() user: User) {
    return this.bookmarksService.getBookmarks(user.id);
  }
}
