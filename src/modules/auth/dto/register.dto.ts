import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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

  @ApiPropertyOptional({ example: 'fr', description: 'Preferred language code' })
  @IsOptional()
  @IsString()
  language?: string;
}
