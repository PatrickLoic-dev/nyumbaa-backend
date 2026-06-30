import {
  Controller,
  Post,
  Get,
  Param,
  Body,
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
import { UploadUrlDto } from './dto/upload-url.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

@ApiTags('posts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post('upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate a presigned Supabase Storage URL for image upload' })
  @ApiOkResponse({ description: '{ uploadUrl, s3Key, cdnUrl }' })
  getUploadUrl(@Body() dto: UploadUrlDto) {
    return this.postsService.generateUploadUrl(dto.filename, dto.contentType);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new post (text + up to 5 images)' })
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
