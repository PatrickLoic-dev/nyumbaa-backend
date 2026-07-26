import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsArray,
  IsUUID,
  ArrayMaxSize,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostVisibility } from '@prisma/client';
import { PostImageDto } from './post-image.dto';

export class CreatePostDto {
  @ApiPropertyOptional({ example: 'Bienvenue sur Nyumba\'a ! 🌍', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content?: string;

  @ApiProperty({ enum: PostVisibility, default: PostVisibility.public })
  @IsEnum(PostVisibility)
  visibility!: PostVisibility;

  @ApiPropertyOptional({
    type: [String],
    description: 'Up to 10 profile UUIDs to mention',
    maxItems: 10,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  mentions?: string[];

  @ApiPropertyOptional({
    type: [PostImageDto],
    description: 'Up to 5 images (s3Key from POST /posts/upload-url)',
    maxItems: 5,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5, { message: JSON.stringify({ error: 'TOO_MANY_IMAGES', max: 5 }) })
  @ValidateNested({ each: true })
  @Type(() => PostImageDto)
  images?: PostImageDto[];
}
