import { Prisma } from '@prisma/client';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';

/**
 * Pure functions: query DTO -> Prisma where/orderBy.
 * Kept out of the service so they are trivially unit-testable.
 */
export function buildTaskWhere(projectId: string, q: ListTasksQueryDto): Prisma.TaskWhereInput {
  const where: Prisma.TaskWhereInput = { projectId };

  if (q.status?.length) where.status = { in: q.status };
  if (q.priority?.length) where.priority = { in: q.priority };
  if (q.assigneeId) where.assigneeId = q.assigneeId;
  if (q.dueBefore || q.dueAfter) {
    where.dueDate = {
      ...(q.dueAfter && { gte: q.dueAfter }),
      ...(q.dueBefore && { lte: q.dueBefore }),
    };
  }
  if (q.search) {
    where.OR = [
      { title: { contains: q.search, mode: 'insensitive' } },
      { description: { contains: q.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export function buildTaskOrderBy(q: ListTasksQueryDto): Prisma.TaskOrderByWithRelationInput[] {
  // secondary sort by id keeps pagination stable when values are equal
  const primary: Prisma.TaskOrderByWithRelationInput =
    q.sortBy === 'dueDate'
      ? { dueDate: { sort: q.order, nulls: 'last' } }
      : { [q.sortBy]: q.order };
  return [primary, { id: 'asc' }];
}
