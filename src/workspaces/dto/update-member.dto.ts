import { WorkspaceRole } from '@prisma/client';
import { IsEnum, IsIn } from 'class-validator';

export class UpdateMemberDto {
  @IsEnum(WorkspaceRole)
  @IsIn([WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
  role: WorkspaceRole;
}
