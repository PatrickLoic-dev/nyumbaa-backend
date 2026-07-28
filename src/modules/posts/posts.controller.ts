import {
  Controller,
  Post,
  Get,
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
} from '@nestjs/swagger';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UploadUrlDto, VideoUploadUrlDto } from './dto/upload-url.dto';
import { FeedQueryDto } from './dto/feed-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get()
  @ApiOperation({ summary: 'Public feed — cursor-based, newest first' })
  @ApiOkResponse({ description: '{ data, nextCursor, hasMore }' })
  getFeed(@CurrentUser() user: User, @Query() q: FeedQueryDto) {
    return this.postsService.findFeed(user.id, q.cursor, q.limit);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Trending posts (most liked in last 24 h)' })
  @ApiOkResponse({ description: 'PostWithMeta[]' })
  getTrending(@CurrentUser() user: User) {
    return this.postsService.findTrending(user.id);
  }

  @Get('trending/topics')
  @ApiOperation({ summary: 'Trending topics derived from user interests' })
  @ApiOkResponse({ description: '{ label, count }[]' })
  getTrendingTopics() {
    return this.postsService.findTrendingTopics();
  }

  @Post('upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a presigned Supabase Storage URL for image upload' })
  @ApiOkResponse({ description: '{ uploadUrl, s3Key, cdnUrl }' })
  getUploadUrl(@Body() dto: UploadUrlDto) {
    return this.postsService.generateUploadUrl(dto.filename, dto.contentType);
  }

  @Post('video-upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a presigned Supabase Storage URL for video upload (max 200 MB)' })
  @ApiOkResponse({ description: '{ uploadUrl, s3Key, cdnUrl }' })
  getVideoUploadUrl(@Body() dto: VideoUploadUrlDto) {
    return this.postsService.generateVideoUploadUrl(dto.filename, dto.contentType);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new post (text + up to 5 images + 1 video)' })
  @ApiCreatedResponse({ description: 'Post created — fanout enqueued, moderation async' })
  create(@CurrentUser() user: User, @Body() dto: CreatePostDto) {
    return this.postsService.create(user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a post by id (private posts → 403 for non-authors)' })
  @ApiOkResponse({ description: 'Post returned' })
  @ApiForbiddenResponse({ description: 'Post is private and requester is not the author' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.postsService.findOneForUser(id, user.id);
  }
}
