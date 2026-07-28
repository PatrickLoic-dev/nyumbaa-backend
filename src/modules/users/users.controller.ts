import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SendPhoneOtpDto, VerifyPhoneOtpDto } from './dto/phone-otp.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';
import { UploadService } from '../../common/upload/upload.service';
import { UploadUrlDto } from '../posts/dto/upload-url.dto';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploadService: UploadService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  getMe(@CurrentUser() user: User) {
    return this.usersService.findById(user.id, user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(user.id, dto);
  }

  @Post('me/avatar-upload-url')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get a presigned Supabase Storage URL to upload avatar' })
  getAvatarUploadUrl(@CurrentUser() user: User, @Body() dto: Pick<UploadUrlDto, 'contentType'>) {
    return this.uploadService.createAvatarUploadUrl(user.id, dto.contentType);
  }

  @Post('me/phone/send-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send SMS OTP to verify phone number' })
  sendPhoneOtp(
    @CurrentUser() user: User,
    @Headers('authorization') auth: string,
    @Body() dto: SendPhoneOtpDto,
  ) {
    const jwt = auth?.slice(7) ?? '';
    return this.usersService.sendPhoneOtp(jwt, dto.phone);
  }

  @Post('me/phone/verify-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Verify SMS OTP and mark phone as verified' })
  verifyPhoneOtp(
    @CurrentUser() user: User,
    @Headers('authorization') auth: string,
    @Body() dto: VerifyPhoneOtpDto,
  ) {
    const jwt = auth?.slice(7) ?? '';
    return this.usersService.verifyPhoneOtp(jwt, user.id, dto.phone, dto.token);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user profile by id' })
  findOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.usersService.findById(id, user.id);
  }

  @Get(':id/posts')
  @ApiOperation({ summary: 'Get posts by user' })
  getUserPosts(@CurrentUser() user: User, @Param('id') id: string) {
    return this.usersService.getUserPosts(id, user.id);
  }

  @Get(':id/followers')
  @ApiOperation({ summary: 'Get followers of user' })
  getFollowers(@CurrentUser() user: User, @Param('id') id: string) {
    return this.usersService.getFollowers(id, user.id);
  }

  @Get(':id/following')
  @ApiOperation({ summary: 'Get users that user is following' })
  getFollowing(@CurrentUser() user: User, @Param('id') id: string) {
    return this.usersService.getFollowing(id, user.id);
  }

  @Post(':id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Follow a user' })
  follow(@CurrentUser() user: User, @Param('id') id: string) {
    return this.usersService.follow(user.id, id);
  }

  @Delete(':id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollow(@CurrentUser() user: User, @Param('id') id: string) {
    return this.usersService.unfollow(user.id, id);
  }
}
