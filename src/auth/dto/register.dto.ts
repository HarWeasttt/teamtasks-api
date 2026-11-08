import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  /** @example "anna@example.com" */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  /** @example "Anna Kowalska" */
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name: string;

  /** @example "Str0ngPassw0rd!" */
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt only uses the first 72 bytes
  password: string;
}
