import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { publicUserSelect } from '../auth/user.select';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { hasRole } from '../workspaces/workspace-access.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
  ) {}

  async create(userId: string, taskId: string, dto: CreateCommentDto) {
    await this.tasks.getAccessibleTask(userId, taskId);
    return this.prisma.comment.create({
      data: { body: dto.body, taskId, authorId: userId },
      include: { author: { select: publicUserSelect } },
    });
  }

  async findAll(userId: string, taskId: string, query: PaginationQueryDto) {
    await this.tasks.getAccessibleTask(userId, taskId);
    const where = { taskId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        ...toSkipTake(query.page, query.limit),
        include: { author: { select: publicUserSelect } },
      }),
      this.prisma.comment.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  /** Author or ADMIN+ */
  async remove(userId: string, id: string): Promise<void> {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    const { role } = await this.tasks.getAccessibleTask(userId, comment.taskId).catch(() => {
      throw new NotFoundException('Comment not found');
    });
    if (comment.authorId !== userId && !hasRole(role, WorkspaceRole.ADMIN)) {
      throw new ForbiddenException('Only the author or an admin can delete a comment');
    }
    await this.prisma.comment.delete({ where: { id } });
  }
}
