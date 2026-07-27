import { Module } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { SupabaseModule } from '../../common/supabase/supabase.module';

@Module({
  imports: [PrismaModule, SupabaseModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
