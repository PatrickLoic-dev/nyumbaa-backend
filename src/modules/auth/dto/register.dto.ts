import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsEnum, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppLanguage } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;

  @ApiProperty({ example: 'Amara Diallo' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  displayName!: string;

  @ApiPropertyOptional({ enum: AppLanguage, example: AppLanguage.fr, description: 'Preferred UI language' })
  @IsOptional()
  @IsEnum(AppLanguage)
  language?: AppLanguage;

  @ApiPropertyOptional({ example: '+237600000000', description: 'E.164 phone number (+<country><number>)' })
  @IsOptional()
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'phoneNumber must be a valid E.164 number (e.g. +237600000000)' })
  phoneNumber?: string;
}
