import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
}
