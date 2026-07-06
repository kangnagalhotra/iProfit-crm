import {
  IsOptional, IsString, MaxLength,
  ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAccountDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(255) domain?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(40) sizeBucket?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() @MaxLength(80) companyType?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) annualRevenue?: number;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(255) domain?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(40) sizeBucket?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() @MaxLength(80) companyType?: string;
  @IsOptional() @IsString() @MaxLength(255) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) annualRevenue?: number;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
}

export class ListAccountsQuery {
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() page?: string;
  @IsOptional() pageSize?: string;
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsString() sortDir?: 'asc' | 'desc';
}

export class ImportAccountRowDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(255) domain?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() stageName?: string;
}

export class BulkImportAccountsDto {
  @ValidateNested({ each: true })
  @Type(() => ImportAccountRowDto)
  @ArrayMinSize(1)
  rows: ImportAccountRowDto[];
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
