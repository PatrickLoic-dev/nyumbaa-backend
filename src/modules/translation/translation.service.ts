import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as deepl from 'deepl-node';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TranslateDto } from './dto/translate.dto';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);
  private readonly translator: deepl.Translator | null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('deepl.apiKey');
    if (apiKey) {
      this.translator = new deepl.Translator(apiKey);
    } else {
      this.translator = null;
      this.logger.warn('DEEPL_API_KEY not set — translation disabled');
    }
  }

  async translate(dto: TranslateDto): Promise<{ translatedText: string; cached: boolean }> {
    if (!this.translator) {
      return { translatedText: dto.text, cached: false };
    }

    // Only use cache for message translations (messageId links to messages table)
    if (dto.messageId) {
      const cached = await this.prisma.translationCache.findUnique({
        where: {
          messageId_targetLang: {
            messageId: dto.messageId,
            targetLang: dto.targetLang,
          },
        },
      });

      if (cached) return { translatedText: cached.translatedText, cached: true };
    }

    const result = await this.translator.translateText(
      dto.text,
      null,
      dto.targetLang as deepl.TargetLanguageCode,
    );

    const translatedText = result.text;

    if (dto.messageId) {
      await this.prisma.translationCache.create({
        data: {
          messageId: dto.messageId,
          targetLang: dto.targetLang,
          translatedText,
        },
      });
    }

    return { translatedText, cached: false };
  }
}
