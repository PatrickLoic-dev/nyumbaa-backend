import { Controller, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CallsService } from './calls.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';
import { PrismaService } from '../../common/prisma/prisma.service';

@ApiTags('calls')
@ApiBearerAuth()
@Controller('calls')
export class CallsController {
  constructor(
    private readonly callsService: CallsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post(':conversationId/token')
  @ApiOperation({ summary: 'Get a LiveKit room token for a call' })
  async getToken(
    @Param('conversationId') conversationId: string,
    @CurrentUser() user: User,
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: user.id },
      select: { displayName: true },
    });
    return this.callsService.generateToken(
      user.id,
      conversationId,
      profile?.displayName ?? user.id,
    );
  }
}
