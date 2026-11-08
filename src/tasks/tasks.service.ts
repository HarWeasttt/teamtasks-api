import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { publicUserSelect } from '../auth/user.select';
import { paginate, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { hasRole, WorkspaceAccessService } from '../workspaces/workspace-access.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { buildTaskOrderBy, buildTaskWhere } from './task-query.builder';

const taskInclude = {
  assignee: { select: publicUserSelect },
  creator: { select: publicUserSelect },
} as const;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  async create(userId: string, projectId: string, dto: CreateTaskDto) {
    const { workspaceId } = await this.access.requireProjectRole(userId, projectId);
    await this.assertAssignable(dto.assigneeId, workspaceId);
    return this.prisma.task.create({
      data: { ...dto, projectId, creatorId: userId },
      include: taskInclude,
    });
  }

  async findAll(userId: string, projectId: string, query: ListTasksQueryDto) {
    await this.access.requireProjectRole(userId, projectId);
    const where = buildTaskWhere(projectId, query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where,
        orderBy: buildTaskOrderBy(query),
        ...toSkipTake(query.page, query.limit),
        include: { ...taskInclude, _count: { select: { comments: true } } },
      }),
      this.prisma.task.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(userId: string, id: string) {
    await this.getAccessibleTask(userId, id);
    return this.prisma.task.findUniqueOrThrow({
      where: { id },
      include: { ...taskInclude, _count: { select: { comments: true } } },
    });
  }

  async update(userId: string, id: string, dto: UpdateTaskDto) {
    const { workspaceId } = await this.getAccessibleTask(userId, id);
    await this.assertAssignable(dto.assigneeId, workspaceId);
    return this.prisma.task.update({ where: { id }, data: dto, include: taskInclude });
  }

  /** Creator or ADMIN+ can delete. */
  async remove(userId: string, id: string): Promise<void> {
    const { task, role } = await this.getAccessibleTask(userId, id);
    if (task.creatorId !== userId && !hasRole(role, WorkspaceRole.ADMIN)) {
      throw new ForbiddenException('Only the task creator or an admin can delete it');
    }
    await this.prisma.task.delete({ where: { id } });
  }

  /** Used by comments too: loads the task and checks workspace membership. */
  async getAccessibleTask(userId: string, taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, creatorId: true, project: { select: { workspaceId: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    const workspaceId = task.project.workspaceId;
    const membership = await this.access.requireRole(userId, workspaceId).catch((e: unknown) => {
      if (e instanceof NotFoundException) throw new NotFoundException('Task not found');
      throw e;
    });
    return { task, workspaceId, role: membership.role };
  }

  private async assertAssignable(assigneeId: string | null | undefined, workspaceId: string) {
    if (!assigneeId) return;
    if (!(await this.access.isMember(assigneeId, workspaceId))) {
      throw new BadRequestException('Assignee must be a member of the workspace');
    }
  }
}
