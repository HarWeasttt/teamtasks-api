import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  /** @example "anna@example.com" */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  /** @example "Str0ngPassw0rd!" */
  @IsString()
  @MinLength(1)
  password: string;
}
