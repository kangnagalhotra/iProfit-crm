import {
  IsEmail, IsIn, IsString, MinLength, MaxLength, Matches,
} from 'class-validator';
import { Role } from '@prisma/client';

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

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(200)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString() @MinLength(10)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'Password needs a letter and a number' })
  password: string;

  // Deliberately excludes ADMIN — creating admins is not this endpoint's job;
  // it's a quick "add a teammate as an owner" flow, not user administration.
  @IsIn([Role.SALES_REP, Role.SALES_MANAGER])
  role: Role;
}
