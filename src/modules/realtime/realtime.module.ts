import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  providers: [RealtimeGateway, PrismaService],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
