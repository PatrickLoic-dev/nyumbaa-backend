import { IsOptional, IsString, IsUrl } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string | undefined;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl()
  avatarUrl?: string | undefined;

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsString()
  language?: string | undefined;

  @ApiPropertyOptional({ example: 'Africa/Douala' })
  @IsOptional()
  @IsString()
  timezone?: string | undefined;
}
