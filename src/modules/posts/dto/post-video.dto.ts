import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsPositive,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PostVideoDto {
  @ApiProperty({ description: 'S3 key returned by POST /posts/video-upload-url' })
  @IsString()
  @IsNotEmpty()
  s3Key!: string;

  @ApiPropertyOptional({ description: 'S3 key of the thumbnail image (optional)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  thumbnailS3Key?: string;

  @ApiPropertyOptional({ description: 'Video duration in seconds' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  durationSec?: number;

  @ApiProperty({ description: 'Display order (0-4)', minimum: 0, maximum: 4 })
  @IsInt()
  @Min(0)
  @Max(4)
  order!: number;
}
