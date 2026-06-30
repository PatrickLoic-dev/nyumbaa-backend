import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type AllowedContentType = 'image/jpeg' | 'image/png' | 'image/webp';

export class UploadUrlDto {
  @ApiProperty({ example: 'photo.jpg' })
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsEnum(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: AllowedContentType;

  @ApiPropertyOptional({ description: 'True when generating URL for a draft post image' })
  @IsOptional()
  @IsBoolean()
  postDraft?: boolean;
}
