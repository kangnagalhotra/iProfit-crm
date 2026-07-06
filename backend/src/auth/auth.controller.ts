import {
  Body, Controller, ConflictException, Get, Post, HttpCode, UseGuards,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, CreateUserDto } from './dto';
import { PrismaService } from '../prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
}

// Minimal users listing (for owner pickers) — kept separate from AuthController's
// public register/login routes so it can carry its own guard.
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  findAll() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true, fullName: true, email: true, role: true,
      },
      orderBy: { fullName: 'asc' },
    });
  }

  // Quick "add a teammate as an owner" flow (e.g. from the Lead form's Owner picker) —
  // not a token-issuing endpoint like /auth/register, and role is capped at SALES_REP/
  // SALES_MANAGER by CreateUserDto, so this can't be used to mint new Admins.
  @Post()
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  async create(@Body() dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName, email: dto.email, passwordHash, role: dto.role,
      },
      select: {
        id: true, fullName: true, email: true, role: true,
      },
    });
    return user;
  }
}
