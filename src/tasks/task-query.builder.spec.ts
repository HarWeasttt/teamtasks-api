import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { buildTaskOrderBy, buildTaskWhere } from './task-query.builder';

/** Simulates what ValidationPipe does with a raw query string object. */
function parse(query: Record<string, string>): ListTasksQueryDto {
  const dto = plainToInstance(ListTasksQueryDto, query);
  const errors = validateSync(dto);
  if (errors.length) throw new Error(JSON.stringify(errors.map((e) => e.constraints)));
  return dto;
}

describe('task query builder', () => {
  it('only scopes by project when no filters are given', () => {
    expect(buildTaskWhere('p1', parse({}))).toEqual({ projectId: 'p1' });
  });

  it('parses comma-separated statuses into an IN filter', () => {
    const where = buildTaskWhere('p1', parse({ status: 'TODO,IN_PROGRESS' }));
    expect(where.status).toEqual({ in: ['TODO', 'IN_PROGRESS'] });
  });

  it('builds a due date range and a case-insensitive search', () => {
    const where = buildTaskWhere(
      'p1',
      parse({ dueAfter: '2026-01-01', dueBefore: '2026-02-01', search: 'login' }),
    );
    expect(where.dueDate).toEqual({ gte: new Date('2026-01-01'), lte: new Date('2026-02-01') });
    expect(where.OR).toEqual([
      { title: { contains: 'login', mode: 'insensitive' } },
      { description: { contains: 'login', mode: 'insensitive' } },
    ]);
  });

  it('rejects unknown enum values and sort fields', () => {
    expect(() => parse({ status: 'DONE,NOPE' })).toThrow();
    expect(() => parse({ sortBy: 'passwordHash' })).toThrow();
  });

  it('defaults to newest first with a stable tie-breaker', () => {
    expect(buildTaskOrderBy(parse({}))).toEqual([{ createdAt: 'desc' }, { id: 'asc' }]);
  });

  it('puts tasks without a due date last when sorting by dueDate', () => {
    expect(buildTaskOrderBy(parse({ sortBy: 'dueDate', order: 'asc' }))[0]).toEqual({
      dueDate: { sort: 'asc', nulls: 'last' },
    });
  });
});
