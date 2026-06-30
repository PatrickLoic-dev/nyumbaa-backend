import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsArray,
  IsUUID,
  ArrayMaxSize,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ example: 'Super post !', maxLength: 500 })
  @IsString()
  @IsNotEmpty({ message: JSON.stringify({ error: 'EMPTY_COMMENT' }) })
  @MaxLength(500, { message: JSON.stringify({ error: 'CONTENT_TOO_LONG', max: 500 }) })
  content!: string;

  @ApiPropertyOptional({ type: [String], description: 'Up to 10 mentioned profile UUIDs' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  mentions?: string[];
}
