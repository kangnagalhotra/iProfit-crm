import {
  IsDateString, IsEnum, IsNumber, IsOptional, IsString, MaxLength,
  ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DealType } from '@prisma/client';

export class CreateOpportunityDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsDateString() closeDate?: string;
  @IsOptional() @IsEnum(DealType) dealType?: DealType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(80) source?: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() leadId?: string;
}

export class UpdateOpportunityDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsDateString() closeDate?: string;
  @IsOptional() @IsEnum(DealType) dealType?: DealType;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @MaxLength(80) source?: string;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsString() leadId?: string;
}

export class ListOpportunitiesQuery {
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsDateString() createdAfter?: string;
  @IsOptional() page?: string;
  @IsOptional() pageSize?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsString() sortDir?: 'asc' | 'desc';
}

export class ImportOpportunityRowDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number;
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;
  @IsOptional() @IsDateString() closeDate?: string;
  @IsOptional() @IsString() stageName?: string;
}

export class BulkImportOpportunitiesDto {
  @ValidateNested({ each: true })
  @Type(() => ImportOpportunityRowDto)
  @ArrayMinSize(1)
  rows: ImportOpportunityRowDto[];
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
