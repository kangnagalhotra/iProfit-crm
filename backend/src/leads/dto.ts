import {
  IsEmail, IsOptional, IsString, MaxLength, IsEnum, IsInt, IsNumber, Min, Matches, IsDateString,
  ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadSource } from '@prisma/client';

const PHONE_PATTERN = /^\+?\d{10}$/;
const PHONE_MESSAGE = 'Phone number must contain exactly 10 digits.';
const VALUE_MESSAGE = 'Lead value cannot be negative.';

export class CreateLeadDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE }) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0, { message: VALUE_MESSAGE }) value?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE }) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0, { message: VALUE_MESSAGE }) value?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsInt() @Min(0) score?: number;
}

export class ListLeadsQuery {
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() createdAfter?: string;
  @IsOptional() page?: string;
  @IsOptional() pageSize?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsString() sortDir?: 'asc' | 'desc';
}

export class ImportLeadRowDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  @IsOptional() @IsString() stageName?: string;
}

export class BulkImportLeadsDto {
  @ValidateNested({ each: true })
  @Type(() => ImportLeadRowDto)
  @ArrayMinSize(1)
  rows: ImportLeadRowDto[];
}

export class BulkStageDto {
  @ArrayMinSize(1) @IsString({ each: true }) ids: string[];
  @IsString() stageId: string;
}

export class BulkDeleteDto {
  @ArrayMinSize(1) @IsString({ each: true }) ids: string[];
}

export class BulkOwnerDto {
  @ArrayMinSize(1) @IsString({ each: true }) ids: string[];
  @IsString() ownerId: string;
}
