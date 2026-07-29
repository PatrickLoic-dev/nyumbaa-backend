import { Module } from '@nestjs/common';
import { RepostsController } from './reposts.controller';
import { RepostsService } from './reposts.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [RepostsController],
  providers: [RepostsService],
})
export class RepostsModule {}
