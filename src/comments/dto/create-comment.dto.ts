import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  /** @example "Blocked by the API change, will pick it up tomorrow." */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body: string;
}
