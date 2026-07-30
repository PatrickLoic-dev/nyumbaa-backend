import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
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

  @Get('search')
  @ApiOperation({ summary: 'Search users by username or display name' })
  search(@Query('q') q: string, @CurrentUser() user: User) {
    return this.usersService.search(q ?? '', user.id);
  }

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

  @Patch('me/privacy')
  @ApiOperation({ summary: 'Update privacy settings' })
  updatePrivacy(@CurrentUser() user: User, @Body() dto: UpdatePrivacyDto) {
    return this.usersService.updatePrivacy(user.id, dto);
  }

  @Get('me/blocked')
  @ApiOperation({ summary: 'Get blocked users' })
  getBlocked(@CurrentUser() user: User) {
    return this.usersService.getBlockedUsers(user.id);
  }

  @Get('me/archived')
  @ApiOperation({ summary: 'Get archived posts' })
  getArchived(@CurrentUser() user: User) {
    return this.usersService.getArchivedPosts(user.id);
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

  @Put('me/public-key')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload E2E encryption public key' })
  updatePublicKey(@CurrentUser() user: User, @Body() dto: { publicKey: string }) {
    return this.usersService.updatePublicKey(user.id, dto.publicKey);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete current account permanently' })
  async deleteMe(@CurrentUser() user: User) {
    await this.usersService.deleteMe(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user profile by id' })
  findOne(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.findById(id, user.id);
  }

  @Get(':id/posts')
  @ApiOperation({ summary: 'Get posts by user' })
  getUserPosts(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUserPosts(id, user.id);
  }

  @Get(':id/followers')
  @ApiOperation({ summary: 'Get followers of user' })
  getFollowers(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getFollowers(id, user.id);
  }

  @Get(':id/following')
  @ApiOperation({ summary: 'Get users that user is following' })
  getFollowing(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getFollowing(id, user.id);
  }

  @Post(':id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Follow a user' })
  follow(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.follow(user.id, id);
  }

  @Delete(':id/follow')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unfollow a user' })
  unfollow(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.unfollow(user.id, id);
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Block a user' })
  block(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.blockUser(user.id, id);
  }

  @Delete(':id/block')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unblock a user' })
  unblock(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.unblockUser(user.id, id);
  }
}
