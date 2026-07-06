import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, ArrayMinSize,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ALLOWED_STAGE_COLORS } from '../common/stage-colors';

export class CreateStageDto {
  @IsString() @MaxLength(100) name: string;
  @Transform(({ value }) => value?.toUpperCase()) @IsIn(ALLOWED_STAGE_COLORS) color: string;
}

export class UpdateStageDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @Transform(({ value }) => value?.toUpperCase()) @IsIn(ALLOWED_STAGE_COLORS) color?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsBoolean() isWon?: boolean;
  @IsOptional() @IsBoolean() isLost?: boolean;
}

export class ReorderStagesDto {
  @ArrayMinSize(1) @IsString({ each: true }) orderedIds: string[];
}
