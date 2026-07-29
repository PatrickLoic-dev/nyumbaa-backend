import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { MessagePermission, CommentPermission } from '@prisma/client';

export class UpdatePrivacyDto {
  @IsOptional() @IsBoolean() isPrivate?: boolean;
  @IsOptional() @IsBoolean() showActivity?: boolean;
  @IsOptional() @IsEnum(MessagePermission) allowMessagesFrom?: MessagePermission;
  @IsOptional() @IsEnum(CommentPermission) allowCommentsFrom?: CommentPermission;
  @IsOptional() @IsBoolean() showReadReceipts?: boolean;
}
