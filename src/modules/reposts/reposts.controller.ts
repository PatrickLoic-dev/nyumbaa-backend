import { Controller, Delete, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RepostsService } from './reposts.service';

@ApiTags('reposts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('posts/:id/repost')
export class RepostsController {
  constructor(private readonly service: RepostsService) {}

  @Post()
  repost(@Param('id') postId: string, @CurrentUser() user: { id: string }) {
    return this.service.repost(postId, user.id);
  }

  @Delete()
  unrepost(@Param('id') postId: string, @CurrentUser() user: { id: string }) {
    return this.service.unrepost(postId, user.id);
  }
}
