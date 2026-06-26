import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsEnum,
  IsArray,
  IsUUID,
  ArrayMaxSize,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostVisibility } from '@prisma/client';

export class CreatePostDto {
  @ApiProperty({ example: 'Bienvenue sur Nyumba\'a ! 🌍', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content!: string;

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
}
