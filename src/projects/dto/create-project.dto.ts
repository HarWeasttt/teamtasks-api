import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  /** @example "Mobile app" */
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  /** @example "iOS and Android client, release 2.0" */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}
