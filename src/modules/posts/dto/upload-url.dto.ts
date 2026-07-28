import { IsString, IsNotEmpty, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type AllowedImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export type AllowedVideoType = 'video/mp4' | 'video/quicktime' | 'video/webm';
export type AllowedContentType = AllowedImageType | AllowedVideoType;

export class UploadUrlDto {
  @ApiProperty({ example: 'photo.jpg' })
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsEnum(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: AllowedImageType;

  @ApiPropertyOptional({ description: 'True when generating URL for a draft post image' })
  @IsOptional()
  @IsBoolean()
  postDraft?: boolean;
}

export class VideoUploadUrlDto {
  @ApiProperty({ example: 'clip.mp4' })
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty({ enum: ['video/mp4', 'video/quicktime', 'video/webm'] })
  @IsEnum(['video/mp4', 'video/quicktime', 'video/webm'])
  contentType!: AllowedVideoType;
}
