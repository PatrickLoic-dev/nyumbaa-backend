import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TranslationService } from './translation.service';
import { TranslateDto } from './dto/translate.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('translation')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('translate')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post()
  @ApiOperation({ summary: 'Translate a message via DeepL (with cache)' })
  translate(@Body() dto: TranslateDto) {
    return this.translationService.translate(dto);
  }
}
