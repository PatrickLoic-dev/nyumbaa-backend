import { IsString, Matches, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendPhoneOtpDto {
  @ApiProperty({ example: '+237600000000' })
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Must be a valid E.164 phone number' })
  phone!: string;
}

export class VerifyPhoneOtpDto {
  @ApiProperty({ example: '+237600000000' })
  @Matches(/^\+[1-9]\d{6,14}$/, { message: 'Must be a valid E.164 phone number' })
  phone!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  token!: string;
}
