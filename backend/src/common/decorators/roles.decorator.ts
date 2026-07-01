import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
// Usage: @Roles(Role.ADMIN, Role.SALES_MANAGER)
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
