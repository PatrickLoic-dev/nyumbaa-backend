import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '@supabase/supabase-js';

class SearchQueryDto {
  @IsString() @IsNotEmpty() q!: string;
  @IsOptional() @IsEnum(['accounts', 'feeds', 'communities']) type?: 'accounts' | 'feeds' | 'communities';
}

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly service: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Global search across accounts, feeds, and communities' })
  @ApiOkResponse({ description: '{ accounts?, feeds?, communities? }' })
  async search(@CurrentUser() user: User, @Query() { q, type }: SearchQueryDto) {
    if (type === 'accounts') return { accounts: await this.service.searchAccounts(q, user.id) };
    if (type === 'feeds') return { feeds: await this.service.searchFeeds(q, user.id) };
    if (type === 'communities') return { communities: await this.service.searchCommunities(q, user.id) };

    const [accounts, feeds, communities] = await Promise.all([
      this.service.searchAccounts(q, user.id, 5),
      this.service.searchFeeds(q, user.id, 5),
      this.service.searchCommunities(q, user.id, 5),
    ]);
    return { accounts, feeds, communities };
  }

  @Get('popular-topics')
  @ApiOperation({ summary: 'Popular search topics' })
  popularTopics() {
    return this.service.popularTopics();
  }

  @Get('users')
  @ApiOperation({ summary: 'Search users by name/username — for new message picker' })
  searchUsers(@CurrentUser() user: User, @Query('q') q: string) {
    if (!q?.trim()) return [];
    return this.service.searchUsers(q, user.id);
  }
}
