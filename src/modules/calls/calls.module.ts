import { Module } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { PrismaService } from '../../common/prisma/prisma.service';

@Module({
  controllers: [CallsController],
  providers: [CallsService, PrismaService],
})
export class CallsModule {}
