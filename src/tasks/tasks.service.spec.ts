import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceAccessService } from '../workspaces/workspace-access.service';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  const prisma = {
    task: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  };
  const access = {
    requireRole: jest.fn(),
    requireProjectRole: jest.fn(),
    isMember: jest.fn(),
  };
  const service = new TasksService(
    prisma as unknown as PrismaService,
    access as unknown as WorkspaceAccessService,
  );

  const task = { id: 't1', creatorId: 'creator', project: { workspaceId: 'w1' } };

  beforeEach(() => jest.resetAllMocks());

  it('refuses to assign a task to someone outside the workspace', async () => {
    access.requireProjectRole.mockResolvedValue({ workspaceId: 'w1' });
    access.isMember.mockResolvedValue(false);
    await expect(
      service.create('u1', 'p1', { title: 'x', assigneeId: 'stranger' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('lets a plain MEMBER delete only their own tasks', async () => {
    prisma.task.findUnique.mockResolvedValue(task);
    access.requireRole.mockResolvedValue({ role: WorkspaceRole.MEMBER });

    await expect(service.remove('someone-else', 't1')).rejects.toBeInstanceOf(ForbiddenException);
    await service.remove('creator', 't1');
    expect(prisma.task.delete).toHaveBeenCalledTimes(1);
  });

  it('lets an ADMIN delete any task', async () => {
    prisma.task.findUnique.mockResolvedValue(task);
    access.requireRole.mockResolvedValue({ role: WorkspaceRole.ADMIN });
    await service.remove('admin', 't1');
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it('hides tasks of other workspaces as 404', async () => {
    prisma.task.findUnique.mockResolvedValue(task);
    access.requireRole.mockRejectedValue(new NotFoundException('Workspace not found'));
    await expect(service.getAccessibleTask('outsider', 't1')).rejects.toThrow('Task not found');
  });
});
