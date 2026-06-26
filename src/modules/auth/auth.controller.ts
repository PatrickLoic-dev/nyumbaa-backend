import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  Get,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new account' })
  @ApiCreatedResponse({ description: 'User registered, tokens returned' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiOkResponse({ description: 'Tokens returned' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invalidate current session' })
  @ApiNoContentResponse()
  logout(@Headers('authorization') auth: string) {
    const token = auth?.slice(7) ?? '';
    return this.authService.logout(token);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a refresh token for new tokens' })
  @ApiOkResponse({ description: 'New tokens returned' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto);
  }

  @Post('forgot-password')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send a password reset email' })
  @ApiNoContentResponse({ description: 'Email sent if address is known' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    const redirectTo = `${process.env.APP_DEEP_LINK ?? 'nyumbaa://'}reset-password`;
    return this.authService.forgotPassword(dto.email, redirectTo);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the currently authenticated user' })
  me(@CurrentUser() user: User) {
    return user;
  }
}
