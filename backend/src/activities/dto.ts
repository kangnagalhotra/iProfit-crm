import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ActivityType } from '@prisma/client';

export class CreateActivityDto {
  @IsEnum(ActivityType) type: ActivityType;
  @IsString() body: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsString() taskId?: string;
}

export class UpdateActivityDto {
  @IsString() body: string;
}
