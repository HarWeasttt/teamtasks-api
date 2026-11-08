import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Membership, WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Higher number = more permissions. OWNER can do everything an ADMIN can, etc. */
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function hasRole(actual: WorkspaceRole, required: WorkspaceRole): boolean {
  return ROLE_RANK[actual] >= ROLE_RANK[required];
}

/**
 * Authorization (RBAC) lives here so every module checks access the same way.
 * Non-members get 404, not 403: outsiders must not learn that a workspace exists.
 */
@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireRole(
    userId: string,
    workspaceId: string,
    required: WorkspaceRole = WorkspaceRole.MEMBER,
  ): Promise<Membership> {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    if (!hasRole(membership.role, required)) {
      throw new ForbiddenException(`Requires ${required} role in this workspace`);
    }
    return membership;
  }

  /** Resolves the project's workspace, then checks the role there. */
  async requireProjectRole(
    userId: string,
    projectId: string,
    required: WorkspaceRole = WorkspaceRole.MEMBER,
  ): Promise<{ workspaceId: string; membership: Membership }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) throw new NotFoundException('Project not found');
    const membership = await this.requireRole(userId, project.workspaceId, required).catch(
      (e: unknown) => {
        // hide the project as well, not only the workspace
        if (e instanceof NotFoundException) throw new NotFoundException('Project not found');
        throw e;
      },
    );
    return { workspaceId: project.workspaceId, membership };
  }

  async isMember(userId: string, workspaceId: string): Promise<boolean> {
    const count = await this.prisma.membership.count({ where: { userId, workspaceId } });
    return count > 0;
  }
}
