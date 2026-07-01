import {
  IsEmail, IsOptional, IsString, MaxLength, IsEnum, IsInt, Min,
  ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LeadStatus, LeadSource, PreferredContactMethod } from '@prisma/client';

export class CreateLeadDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsEnum(PreferredContactMethod) preferredContactMethod?: PreferredContactMethod;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsEnum(LeadSource) source?: LeadSource;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsEnum(PreferredContactMethod) preferredContactMethod?: PreferredContactMethod;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsInt() @Min(0) score?: number;
}

export class ListLeadsQuery {
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() page?: string;
  @IsOptional() pageSize?: string;
}

export class ImportLeadRowDto {
  @IsOptional() @IsString() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) lastName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(150) jobTitle?: string;
  @IsOptional() @IsEnum(LeadStatus) status?: LeadStatus;
}

export class BulkImportLeadsDto {
  @ValidateNested({ each: true })
  @Type(() => ImportLeadRowDto)
  @ArrayMinSize(1)
  rows: ImportLeadRowDto[];
}
