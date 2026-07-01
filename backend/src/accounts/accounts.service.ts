import {
  Injectable, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateAccountDto, UpdateAccountDto, ListAccountsQuery, ImportAccountRowDto } from './dto';
import { Role } from '@prisma/client';

interface AuthUser { id: string; role: Role; }

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  // Reps see their own accounts; managers and admins see everything.
  private scopeWhere(user: AuthUser) {
    return user.role === Role.SALES_REP ? { ownerId: user.id } : {};
  }

  async create(dto: CreateAccountDto, user: AuthUser) {
    const ownerId = dto.ownerId ?? user.id;
    return this.prisma.account.create({ data: { ...dto, ownerId } });
  }

  async findAll(query: ListAccountsQuery, user: AuthUser) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, parseInt(query.pageSize ?? '25', 10));
    const where: any = { ...this.scopeWhere(user) };
    if (query.status) where.status = query.status;
    if (query.ownerId && user.role !== Role.SALES_REP) where.ownerId = query.ownerId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { domain: { contains: query.search } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.account.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: { owner: { select: { id: true, fullName: true } } },
      }),
      this.prisma.account.count({ where }),
    ]);
    return { data: rows, page, pageSize, total };
  }

  async findOne(id: string, user: AuthUser) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: { owner: true, leads: true, opportunities: true },
    });
    if (!account) throw new NotFoundException('Company not found');
    if (user.role === Role.SALES_REP && account.ownerId !== user.id) {
      throw new ForbiddenException('You can only view your own companies');
    }
    return account;
  }

  async update(id: string, dto: UpdateAccountDto, user: AuthUser) {
    const account = await this.findOne(id, user); // re-uses scope check
    if (user.role === Role.SALES_REP && dto.ownerId && dto.ownerId !== user.id) {
      throw new ForbiddenException('Reps cannot reassign companies');
    }
    return this.prisma.account.update({ where: { id: account.id }, data: dto });
  }

  async remove(id: string, user: AuthUser) {
    const account = await this.findOne(id, user);
    return this.prisma.account.delete({ where: { id: account.id } });
  }

  // CSV import — never aborts the whole batch on a single bad row. Dedup by
  // domain is a soft, app-level check (Account.domain has no DB-level unique constraint).
  async bulkImport(rows: ImportAccountRowDto[], user: AuthUser) {
    const created: any[] = [];
    const errors: { row: number; domain?: string; message: string }[] = [];
    const seenDomains = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (row.domain) {
          const key = row.domain.toLowerCase();
          if (seenDomains.has(key)) {
            errors.push({ row: i + 1, domain: row.domain, message: 'Duplicate domain within import file' });
            continue;
          }
          const dupe = await this.prisma.account.findFirst({ where: { domain: row.domain } });
          if (dupe) {
            errors.push({ row: i + 1, domain: row.domain, message: 'Company with this domain already exists' });
            continue;
          }
          seenDomains.add(key);
        }
        const account = await this.prisma.account.create({ data: { ...row, ownerId: user.id } });
        created.push(account);
      } catch (e: any) {
        errors.push({ row: i + 1, domain: row.domain, message: e.message ?? 'Unknown error' });
      }
    }
    return { created, errors, summary: { total: rows.length, createdCount: created.length, errorCount: errors.length } };
  }
}
