import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { publicUserSelect } from '../auth/user.select';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { paginate, toSkipTake } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceAccessService } from './workspace-access.service';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  /** Creator becomes OWNER - workspace and membership are created in one transaction. */
  create(userId: string, dto: CreateWorkspaceDto) {
    return this.prisma.workspace.create({
      data: { name: dto.name, members: { create: { userId, role: WorkspaceRole.OWNER } } },
    });
  }

  async findAllForUser(userId: string, query: PaginationQueryDto) {
    const where = { members: { some: { userId } } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.workspace.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...toSkipTake(query.page, query.limit),
        include: {
          members: { where: { userId }, select: { role: true } },
          _count: { select: { members: true, projects: true } },
        },
      }),
      this.prisma.workspace.count({ where }),
    ]);
    const data = items.map(({ members, ...ws }) => ({ ...ws, myRole: members[0]?.role }));
    return paginate(data, total, query.page, query.limit);
  }

  async findOne(userId: string, id: string) {
    const membership = await this.access.requireRole(userId, id);
    const workspace = await this.prisma.workspace.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { members: true, projects: true } } },
    });
    return { ...workspace, myRole: membership.role };
  }

  async update(userId: string, id: string, dto: UpdateWorkspaceDto) {
    await this.access.requireRole(userId, id, WorkspaceRole.ADMIN);
    return this.prisma.workspace.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.access.requireRole(userId, id, WorkspaceRole.OWNER);
    await this.prisma.workspace.delete({ where: { id } });
  }

  async listMembers(userId: string, workspaceId: string, query: PaginationQueryDto) {
    await this.access.requireRole(userId, workspaceId);
    const where = { workspaceId };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        orderBy: { joinedAt: 'asc' },
        ...toSkipTake(query.page, query.limit),
        select: { role: true, joinedAt: true, user: { select: publicUserSelect } },
      }),
      this.prisma.membership.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async addMember(userId: string, workspaceId: string, dto: AddMemberDto) {
    await this.access.requireRole(userId, workspaceId, WorkspaceRole.ADMIN);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('User with this email is not registered');
    if (await this.access.isMember(user.id, workspaceId)) {
      throw new ConflictException('User is already a member');
    }
    return this.prisma.membership.create({
      data: { userId: user.id, workspaceId, role: dto.role },
      select: { role: true, joinedAt: true, user: { select: publicUserSelect } },
    });
  }

  /** Only the OWNER changes roles; the owner's own role is fixed. */
  async updateMember(userId: string, workspaceId: string, memberId: string, dto: UpdateMemberDto) {
    await this.access.requireRole(userId, workspaceId, WorkspaceRole.OWNER);
    if (memberId === userId) throw new BadRequestException('Owner cannot change own role');
    return this.prisma.membership.update({
      where: { userId_workspaceId: { userId: memberId, workspaceId } },
      data: { role: dto.role },
      select: { role: true, joinedAt: true, user: { select: publicUserSelect } },
    });
  }

  /** Admins remove members; anyone can leave; the owner cannot leave or be removed. */
  async removeMember(userId: string, workspaceId: string, memberId: string): Promise<void> {
    const actor = await this.access.requireRole(userId, workspaceId);
    const target = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId: memberId, workspaceId } },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === WorkspaceRole.OWNER) {
      throw new BadRequestException('Owner cannot be removed from the workspace');
    }
    const isSelf = memberId === userId;
    if (!isSelf && actor.role === WorkspaceRole.MEMBER) {
      throw new ForbiddenException('Requires ADMIN role in this workspace');
    }
    await this.prisma.membership.delete({
      where: { userId_workspaceId: { userId: memberId, workspaceId } },
    });
  }
}
