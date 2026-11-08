import { Injectable } from '@nestjs/common';
import { Prisma, WorkspaceRole } from '@prisma/client';
import { paginate, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  async create(userId: string, workspaceId: string, dto: CreateProjectDto) {
    await this.access.requireRole(userId, workspaceId, WorkspaceRole.ADMIN);
    return this.prisma.project.create({ data: { ...dto, workspaceId } });
  }

  async findAll(userId: string, workspaceId: string, query: ListProjectsQueryDto) {
    await this.access.requireRole(userId, workspaceId);
    const where: Prisma.ProjectWhereInput = {
      workspaceId,
      ...(query.search && { name: { contains: query.search, mode: 'insensitive' } }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query.page, query.limit),
        include: { _count: { select: { tasks: true } } },
      }),
      this.prisma.project.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findOne(userId: string, id: string) {
    await this.access.requireProjectRole(userId, id);
    const [project, byStatus] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id } }),
      this.prisma.task.groupBy({ by: ['status'], where: { projectId: id }, _count: true }),
    ]);
    // small dashboard: number of tasks per status
    const taskStats = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
    return { ...project, taskStats };
  }

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    await this.access.requireProjectRole(userId, id, WorkspaceRole.ADMIN);
    return this.prisma.project.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.access.requireProjectRole(userId, id, WorkspaceRole.ADMIN);
    await this.prisma.project.delete({ where: { id } });
  }
}
