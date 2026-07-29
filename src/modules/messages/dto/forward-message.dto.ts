import { IsArray, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForwardMessageDto {
  @ApiProperty({ type: [String], description: 'List of recipient user IDs to forward to' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  recipientIds!: string[];
}
