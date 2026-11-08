import { TaskPriority, TaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTaskDto {
  /** @example "Implement password reset" */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  /** ISO 8601. @example "2026-12-01T17:00:00.000Z" */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueDate?: Date;

  /** Must be a member of the workspace. */
  @IsOptional()
  @IsUUID()
  assigneeId?: string;
}
