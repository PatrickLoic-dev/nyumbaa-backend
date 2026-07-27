import {
  IsOptional,
  IsString,
  IsUrl,
  IsEnum,
  Matches,
  MaxLength,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppLanguage } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Amara Diallo' })
  @IsOptional()
  @IsString()
  @MaxLength(48)
  displayName?: string;

  @ApiPropertyOptional({ example: 'amara_diallo', description: 'Unique username (alphanumeric + _)' })
  @IsOptional()
  @Matches(/^[a-zA-Z0-9_]{2,30}$/, {
    message: 'username must be 2-30 chars: letters, numbers and underscores only',
  })
  username?: string;

  @ApiPropertyOptional({ example: 'Passionné de culture africaine 🌍' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bio?: string;

  @ApiPropertyOptional({ example: 'Cameroun' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiPropertyOptional({ example: ['Musique', 'Sport'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(5)
  interests?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @ApiPropertyOptional({ enum: AppLanguage, example: AppLanguage.fr })
  @IsOptional()
  @IsEnum(AppLanguage)
  language?: AppLanguage;

  @ApiPropertyOptional({ example: 'Africa/Douala' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: '+237600000000', description: 'E.164 phone number' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phoneNumber must be a valid E.164 number (e.g. +237600000000)' })
  phoneNumber?: string;
}
