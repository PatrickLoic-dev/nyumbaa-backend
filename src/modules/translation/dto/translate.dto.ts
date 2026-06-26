import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TranslateDto {
  @ApiProperty()
  @IsUUID('4')
  messageId!: string;

  @ApiProperty()
  @IsString()
  text!: string;

  @ApiProperty({ example: 'EN-GB' })
  @IsString()
  targetLang!: string;
}
