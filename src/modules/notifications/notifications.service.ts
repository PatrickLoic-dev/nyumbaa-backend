import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterTokenDto } from './dto/register-token.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async registerToken(userId: string, dto: RegisterTokenDto) {
    return this.prisma.pushToken.upsert({
      where: {
        userId_platform: {
          userId,
          platform: dto.platform,
        },
      },
      update: { expoToken: dto.expoToken },
      create: {
        userId,
        expoToken: dto.expoToken,
        platform: dto.platform,
      },
    });
  }
}
