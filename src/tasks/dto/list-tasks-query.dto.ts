import { TaskPriority, TaskStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** `?status=TODO,IN_PROGRESS` and `?status=TODO&status=DONE` both work. */
const toArray = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.split(',').map((v) => v.trim()) : value;

export const TASK_SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'title'] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export class ListTasksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(toArray)
  @IsEnum(TaskStatus, { each: true })
  status?: TaskStatus[];

  @IsOptional()
  @Transform(toArray)
  @IsEnum(TaskPriority, { each: true })
  priority?: TaskPriority[];

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  /** Full-text-ish search in title and description (case-insensitive). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueBefore?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAfter?: Date;

  @IsOptional()
  @IsIn(TASK_SORT_FIELDS)
  sortBy: TaskSortField = 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'desc';
}
