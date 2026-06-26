import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as deepl from 'deepl-node';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TranslateDto } from './dto/translate.dto';

@Injectable()
export class TranslationService {
  private readonly translator: deepl.Translator;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.translator = new deepl.Translator(this.config.get<string>('deepl.apiKey')!);
  }

  async translate(dto: TranslateDto) {
    const cached = await this.prisma.translationCache.findUnique({
      where: {
        messageId_targetLang: {
          messageId: dto.messageId,
          targetLang: dto.targetLang,
        },
      },
    });

    if (cached) return { translatedText: cached.translatedText, cached: true };

    const result = await this.translator.translateText(
      dto.text,
      null,
      dto.targetLang as deepl.TargetLanguageCode,
    );

    const translatedText = result.text;

    await this.prisma.translationCache.create({
      data: {
        messageId: dto.messageId,
        targetLang: dto.targetLang,
        translatedText,
      },
    });

    return { translatedText, cached: false };
  }
}
