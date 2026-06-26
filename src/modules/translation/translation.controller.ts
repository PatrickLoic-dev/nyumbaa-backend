import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TranslationService } from './translation.service';
import { TranslateDto } from './dto/translate.dto';

@ApiTags('translation')
@ApiBearerAuth()
@Controller('translate')
export class TranslationController {
  constructor(private readonly translationService: TranslationService) {}

  @Post()
  @ApiOperation({ summary: 'Translate a message via DeepL (with cache)' })
  translate(@Body() dto: TranslateDto) {
    return this.translationService.translate(dto);
  }
}
