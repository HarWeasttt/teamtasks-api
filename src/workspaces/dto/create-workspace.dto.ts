import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateWorkspaceDto {
  /** @example "Acme Engineering" */
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;
}
