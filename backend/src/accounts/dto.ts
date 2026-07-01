import {
  IsOptional, IsString, MaxLength, IsEnum,
  ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AccountStatus } from '@prisma/client';

export class CreateAccountDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(255) domain?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(40) sizeBucket?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
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
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @IsOptional() @IsString() ownerId?: string;
}

export class ListAccountsQuery {
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() page?: string;
  @IsOptional() pageSize?: string;
}

export class ImportAccountRowDto {
  @IsString() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(255) domain?: string;
  @IsOptional() @IsString() @MaxLength(120) industry?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsEnum(AccountStatus) status?: AccountStatus;
}

export class BulkImportAccountsDto {
  @ValidateNested({ each: true })
  @Type(() => ImportAccountRowDto)
  @ArrayMinSize(1)
  rows: ImportAccountRowDto[];
}
