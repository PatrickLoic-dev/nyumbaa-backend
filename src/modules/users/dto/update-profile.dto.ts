import { IsOptional, IsString, IsUrl, IsEnum, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AppLanguage } from '@prisma/client';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Amara Diallo' })
  @IsOptional()
  @IsString()
  displayName?: string;

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
