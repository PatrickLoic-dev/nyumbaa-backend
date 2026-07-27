import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  async findById(id: string) {
    const profile = await this.prisma.profile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }

  async updateMe(id: string, dto: UpdateProfileDto) {
    return this.prisma.profile.upsert({
      where: { id },
      update: dto,
      create: {
        id,
        displayName: dto.displayName ?? '',
        avatarUrl: dto.avatarUrl,
        language: dto.language ?? 'fr',
        timezone: dto.timezone ?? 'UTC',
      },
    });
  }

  /**
   * Request a phone OTP via Supabase (requires phone auth + Twilio configured).
   * Supabase will send an SMS with a 6-digit code.
   */
  async sendPhoneOtp(userJwt: string, phone: string): Promise<void> {
    const { error } = await this.supabase.forUser(userJwt).auth.updateUser({ phone });
    if (error) {
      throw new InternalServerErrorException('Failed to send OTP. Phone auth may not be enabled.');
    }
  }

  /**
   * Verify the OTP and mark the phone as verified in our DB.
   * Requires Supabase phone auth (Twilio) to be configured.
   */
  async verifyPhoneOtp(
    userJwt: string,
    userId: string,
    phone: string,
    token: string,
  ): Promise<void> {
    const { error } = await this.supabase.forUser(userJwt).auth.verifyOtp({
      phone,
      token,
      type: 'phone_change',
    });

    if (error) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.prisma.profile.update({
      where: { id: userId },
      data: { phoneNumber: phone, phoneVerified: true },
    });
  }
}
