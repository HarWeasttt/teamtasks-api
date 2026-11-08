import { OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(OmitType(CreateTaskDto, ['assigneeId'] as const)) {
  /** Send null to unassign. */
  @IsOptional()
  @ValidateIf((_o, value) => value !== null)
  @IsUUID()
  assigneeId?: string | null;
}
