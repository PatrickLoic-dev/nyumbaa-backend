import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthResponse, toAuthResponse } from './interfaces/auth-response.interface';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly prisma: PrismaService,
  ) {}

  /** Creates a Supabase auth user and a matching profile row. */
  async register(dto: RegisterDto): Promise<AuthResponse | { emailConfirmationRequired: true }> {
    try {
      this.logger.log(`register: step=signUp email=${dto.email}`);

      const { data, error } = await this.supabase.admin.auth.signUp({
        email: dto.email,
        password: dto.password,
        options: { data: { display_name: dto.displayName } },
      });

      this.logger.log(`register: step=signUpDone user=${!!data?.user} session=${!!data?.session} supabaseError=${error?.message ?? 'none'}`);

      if (error) {
        if (error.message.toLowerCase().includes('already registered')) {
          throw new ConflictException('Email already in use');
        }
        throw new InternalServerErrorException(`Supabase signUp error: ${error.message}`);
      }

      if (!data.user) {
        throw new InternalServerErrorException('Supabase returned no user');
      }

      this.logger.log(`register: step=upsertProfile userId=${data.user.id}`);

      const displayName = dto.displayName?.trim() || dto.email.split('@')[0];

      await this.prisma.profile.upsert({
        where: { id: data.user.id },
        update: {},
        create: {
          id: data.user.id,
          displayName,
          language: 'fr',
          ...(dto.phoneNumber ? { phoneNumber: dto.phoneNumber } : {}),
        },
      });

      this.logger.log(`register: step=upsertDone userId=${data.user.id}`);

      if (!data.session) {
        this.logger.log(`register: step=emailConfirmationRequired`);
        return { emailConfirmationRequired: true };
      }

      return toAuthResponse(data.user, data.session);
    } catch (err) {
      // Re-throw NestJS HTTP exceptions (ConflictException, our explicit throws above)
      if (err instanceof HttpException) throw err;
      // Log and wrap any unexpected error (Prisma, Supabase client bug, etc.)
      this.logger.error(`register: unexpected error type=${(err as Error)?.constructor?.name} msg=${(err as Error)?.message}`, (err as Error)?.stack);
      throw new InternalServerErrorException(`Registration error: ${(err as Error)?.message ?? 'unknown'}`);
    }
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
