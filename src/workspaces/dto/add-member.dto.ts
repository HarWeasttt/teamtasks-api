import { WorkspaceRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsOptional } from 'class-validator';

export class AddMemberDto {
  /** Email of an already registered user. @example "piotr@example.com" */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  /** OWNER cannot be granted by invitation. */
  @IsOptional()
  @IsEnum(WorkspaceRole)
  @IsIn([WorkspaceRole.ADMIN, WorkspaceRole.MEMBER])
  role: WorkspaceRole = WorkspaceRole.MEMBER;
}
