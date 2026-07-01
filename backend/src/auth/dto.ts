import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(200)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(10)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Password needs a letter and a number' })
  password: string;
}

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
