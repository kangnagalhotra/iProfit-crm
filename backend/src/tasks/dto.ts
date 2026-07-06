import {
  ArrayMinSize, IsDateString, IsEnum, IsIn, IsOptional, IsString, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskType, TaskStatus, TaskPriority } from '@prisma/client';

export class CreateTaskDto {
  @IsString() title: string;
  @IsOptional() @IsEnum(TaskType) type?: TaskType;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsDateString() dueAt: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() reminderAt?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() opportunityId?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsEnum(TaskType) type?: TaskType;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() reminderAt?: string;
  @IsOptional() @IsString() assigneeId?: string;
}

export class ListTasksQuery {
  @IsOptional() @IsString() leadId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() opportunityId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['today', 'overdue', 'upcoming']) dueFilter?: 'today' | 'overdue' | 'upcoming';
  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsString() sortDir?: 'asc' | 'desc';
  @IsOptional() page?: string;
  @IsOptional() pageSize?: string;
}

export class BulkStatusDto {
  @ArrayMinSize(1) @IsString({ each: true }) ids: string[];
  @IsEnum(TaskStatus) status: TaskStatus;
}

export class BulkOwnerDto {
  @ArrayMinSize(1) @IsString({ each: true }) ids: string[];
  @IsString() ownerId: string;
}

export class BulkDeleteDto {
  @ArrayMinSize(1) @IsString({ each: true }) ids: string[];
}

export class ImportTaskRowDto {
  @IsString() title: string;
  @IsOptional() @IsEnum(TaskType) type?: TaskType;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  @IsDateString() dueAt: string;
  @IsOptional() @IsString() statusName?: string;
  @IsOptional() @IsIn(['lead', 'account', 'opportunity']) relatedModule?: 'lead' | 'account' | 'opportunity';
  @IsOptional() @IsString() relatedRecordName?: string;
}

export class BulkImportTasksDto {
  @ValidateNested({ each: true })
  @Type(() => ImportTaskRowDto)
  @ArrayMinSize(1)
  rows: ImportTaskRowDto[];
}
