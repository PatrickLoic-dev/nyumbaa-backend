import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TranslateDto {
  @ApiPropertyOptional({ description: 'ID of the message to cache the translation (omit for posts)' })
  @IsOptional()
  @IsUUID('4')
  messageId?: string;

  @ApiProperty()
  @IsString()
  text!: string;

  @ApiProperty({ example: 'EN-GB' })
  @IsString()
  targetLang!: string;
}
