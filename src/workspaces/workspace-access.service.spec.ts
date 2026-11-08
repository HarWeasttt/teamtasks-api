import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { hasRole, WorkspaceAccessService } from './workspace-access.service';

describe('hasRole', () => {
  it.each`
    actual      | required    | expected
    ${'OWNER'}  | ${'ADMIN'}  | ${true}
    ${'ADMIN'}  | ${'ADMIN'}  | ${true}
    ${'ADMIN'}  | ${'OWNER'}  | ${false}
    ${'MEMBER'} | ${'ADMIN'}  | ${false}
    ${'MEMBER'} | ${'MEMBER'} | ${true}
  `('$actual satisfies $required -> $expected', ({ actual, required, expected }) => {
    expect(hasRole(actual as WorkspaceRole, required as WorkspaceRole)).toBe(expected);
  });
});

describe('WorkspaceAccessService', () => {
  const prisma = {
    membership: { findUnique: jest.fn(), count: jest.fn() },
    project: { findUnique: jest.fn() },
  };
  const service = new WorkspaceAccessService(prisma as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('returns 404 (not 403) for non-members so the workspace stays hidden', async () => {
    prisma.membership.findUnique.mockResolvedValue(null);
    await expect(service.requireRole('u', 'w')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 403 when the member has an insufficient role', async () => {
    prisma.membership.findUnique.mockResolvedValue({ role: WorkspaceRole.MEMBER });
    await expect(service.requireRole('u', 'w', WorkspaceRole.ADMIN)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reports a hidden project as "Project not found"', async () => {
    prisma.project.findUnique.mockResolvedValue({ workspaceId: 'w' });
    prisma.membership.findUnique.mockResolvedValue(null);
    await expect(service.requireProjectRole('u', 'p')).rejects.toThrow('Project not found');
  });
});
