import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PostImageDto {
  @ApiProperty({ description: 'S3 key returned by POST /posts/upload-url' })
  @IsString()
  @IsNotEmpty()
  s3Key!: string;

  @ApiPropertyOptional({ description: 'Alt text for accessibility (WCAG 2.1)', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  altText?: string;

  @ApiProperty({ description: 'Display order (0-4)', minimum: 0, maximum: 4 })
  @IsInt()
  @Min(0)
  @Max(4)
  order!: number;
}
