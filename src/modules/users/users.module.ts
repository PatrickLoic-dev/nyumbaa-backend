import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SupabaseModule } from '../../common/supabase/supabase.module';
import { UploadModule } from '../../common/upload/upload.module';

@Module({
  imports: [SupabaseModule, UploadModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
