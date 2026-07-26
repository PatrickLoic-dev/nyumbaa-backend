import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthResponse, toAuthResponse } from './interfaces/auth-response.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  /** Creates a Supabase auth user and a matching profile row. */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const { data, error } = await this.supabase.admin.auth.signUp({
      email: dto.email,
      password: dto.password,
      options: {
        data: { display_name: dto.displayName },
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        throw new ConflictException('Email already in use');
      }
      // Never forward raw provider error messages to the client
      throw new InternalServerErrorException('Registration failed');
    }

    if (!data.user || !data.session) {
      throw new InternalServerErrorException('Registration failed');
    }

    // Upsert profile so it exists even if the Supabase trigger hasn't run yet
    await this.prisma.profile.upsert({
      where: { id: data.user.id },
      update: {},
      create: {
        id: data.user.id,
        displayName: dto.displayName,
        language: dto.language ?? 'fr',
        ...(dto.phoneNumber ? { phoneNumber: dto.phoneNumber } : {}),
      },
    });

    return toAuthResponse(data.user, data.session);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const { data, error } = await this.supabase.admin.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.user || !data.session) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return toAuthResponse(data.user, data.session);
  }

  /** Signs out the user's session identified by their JWT. */
  async logout(jwt: string): Promise<void> {
    const { error } = await this.supabase.forUser(jwt).auth.signOut();
    if (error) throw new UnauthorizedException(error.message);
  }

  async refresh(dto: RefreshDto): Promise<AuthResponse> {
    const { data, error } = await this.supabase.admin.auth.refreshSession({
      refresh_token: dto.refreshToken,
    });

    if (error || !data.user || !data.session) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return toAuthResponse(data.user, data.session);
  }

  /** Triggers Supabase's built-in password reset email. */
  async forgotPassword(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.supabase.admin.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    // Never reveal whether the email exists
    if (error) throw new InternalServerErrorException('Could not send reset email');
  }
}
