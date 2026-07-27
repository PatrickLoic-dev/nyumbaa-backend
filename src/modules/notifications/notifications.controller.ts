import { Controller, Get, Post, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { NotificationsService } from './notifications.service';
import { RegisterTokenDto } from './dto/register-token.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

class UpdateNotificationSettingsDto {
  @IsOptional() @IsBoolean() pushFollowers?: boolean;
  @IsOptional() @IsBoolean() pushComments?: boolean;
  @IsOptional() @IsBoolean() pushLikes?: boolean;
  @IsOptional() @IsBoolean() emailFollowers?: boolean;
  @IsOptional() @IsBoolean() emailComments?: boolean;
  @IsOptional() @IsBoolean() emailLikes?: boolean;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get activity notifications derived from likes and comments on my posts' })
  @ApiOkResponse({ description: 'Notification[]' })
  getNotifications(@CurrentUser() user: User) {
    return this.notificationsService.getNotifications(user.id);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get notification settings for current user' })
  getSettings(@CurrentUser() user: User) {
    return this.notificationsService.getSettings(user.id);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update notification settings' })
  updateSettings(@CurrentUser() user: User, @Body() dto: UpdateNotificationSettingsDto) {
    return this.notificationsService.updateSettings(user.id, dto);
  }

  @Post('register-token')
  @ApiOperation({ summary: 'Register an Expo push token for the current device' })
  registerToken(@CurrentUser() user: User, @Body() dto: RegisterTokenDto) {
    return this.notificationsService.registerToken(user.id, dto);
  }
}
