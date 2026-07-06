import {
  Injectable, NotFoundException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateAccountDto, UpdateAccountDto, ListAccountsQuery, ImportAccountRowDto } from './dto';
import { Role } from '@prisma/client';
import { formatChange } from '../activities/format-field-change';

interface AuthUser { id: string; role: Role; }

const SORTABLE_FIELDS = new Set(['name', 'annualRevenue', 'updatedAt', 'createdAt']);

// Every endpoint that returns an Account includes the same relations, so the
// frontend can trust a consistent shape whether it came from create/update/list/get.
const ACCOUNT_INCLUDE = {
  owner: { select: { id: true, fullName: true } },
  stage: true,
} as const;

@Injectable()
export class AccountsService {
  constructor(private prisma: PrismaService) {}

  // Reps see their own accounts; managers and admins see everything.
  private scopeWhere(user: AuthUser) {
    return user.role === Role.SALES_REP ? { ownerId: user.id } : {};
  }

  private async defaultStageId(): Promise<string> {
    const stage = await this.prisma.accountStage.findFirst({ where: { isDefault: true } });
    if (!stage) throw new ConflictException('No default company stage configured');
    return stage.id;
  }

  async create(dto: CreateAccountDto, user: AuthUser) {
    const ownerId = dto.ownerId ?? user.id;
    const stageId = dto.stageId ?? (await this.defaultStageId());
    return this.prisma.account.create({ data: { ...dto, ownerId, stageId }, include: ACCOUNT_INCLUDE });
  }

  async findAll(query: ListAccountsQuery, user: AuthUser) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, parseInt(query.pageSize ?? '25', 10));
    const where: any = { ...this.scopeWhere(user) };
    if (query.stageId) where.stageId = query.stageId;
    if (query.ownerId && user.role !== Role.SALES_REP) where.ownerId = query.ownerId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { domain: { contains: query.search } },
      ];
    }
    const dir: 'asc' | 'desc' = query.sortDir === 'asc' ? 'asc' : 'desc';
    let orderBy: any = { updatedAt: 'desc' };
    if (query.sortBy === 'stage') orderBy = { stage: { order: dir } };
    else if (SORTABLE_FIELDS.has(query.sortBy ?? '')) orderBy = { [query.sortBy as string]: dir };
    const [rows, total] = await Promise.all([
      this.prisma.account.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy,
        include: { owner: { select: { id: true, fullName: true } }, stage: true },
      }),
      this.prisma.account.count({ where }),
    ]);
    return { data: rows, page, pageSize, total };
  }

  async findOne(id: string, user: AuthUser) {
    const account = await this.prisma.account.findUnique({
      where: { id },
      include: {
        owner: true, stage: true, leads: true, opportunities: true,
      },
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

    const changes: string[] = [];
    if (dto.ownerId !== undefined && dto.ownerId !== account.ownerId) {
      const newOwner = dto.ownerId
        ? await this.prisma.user.findUnique({ where: { id: dto.ownerId }, select: { fullName: true } })
        : null;
      const msg = formatChange('Owner', account.owner?.fullName, newOwner?.fullName);
      if (msg) changes.push(msg);
    }
    if (dto.stageId !== undefined && dto.stageId !== account.stageId) {
      const newStage = await this.prisma.accountStage.findUnique({ where: { id: dto.stageId }, select: { name: true } });
      const msg = formatChange('Status', account.stage?.name, newStage?.name);
      if (msg) changes.push(msg);
    }
    if (dto.annualRevenue !== undefined && String(dto.annualRevenue) !== String(account.annualRevenue ?? '')) {
      const msg = formatChange('Annual Revenue', account.annualRevenue?.toString(), dto.annualRevenue);
      if (msg) changes.push(msg);
    }

    const updated = await this.prisma.account.update({ where: { id: account.id }, data: dto, include: ACCOUNT_INCLUDE });

    if (changes.length) {
      await this.prisma.activity.create({
        data: {
          type: 'FIELD_UPDATE', body: changes.join('\n'), creatorId: user.id, accountId: account.id,
        },
      });
    }

    return updated;
  }

  async remove(id: string, user: AuthUser) {
    const account = await this.findOne(id, user);
    return this.prisma.account.delete({ where: { id: account.id } });
  }

  // Bulk operations — thin loops over the existing single-record path so
  // scope/ownership checks stay in one place rather than a parallel bulk auth path.
  async bulkUpdateStage(ids: string[], stageId: string, user: AuthUser) {
    const stage = await this.prisma.accountStage.findUnique({ where: { id: stageId } });
    if (!stage) throw new NotFoundException('Stage not found');
    const results = await Promise.allSettled(ids.map((id) => this.update(id, { stageId }, user)));
    return this.summarizeBulk(results);
  }

  async bulkUpdateOwner(ids: string[], ownerId: string, user: AuthUser) {
    const results = await Promise.allSettled(ids.map((id) => this.update(id, { ownerId }, user)));
    return this.summarizeBulk(results);
  }

  async bulkDelete(ids: string[], user: AuthUser) {
    const results = await Promise.allSettled(ids.map((id) => this.remove(id, user)));
    return this.summarizeBulk(results);
  }

  private summarizeBulk(results: PromiseSettledResult<any>[]) {
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    return { succeeded, failed, total: results.length };
  }

  // CSV import — never aborts the whole batch on a single bad row. Dedup by
  // domain is a soft, app-level check (Account.domain has no DB-level unique constraint).
  async bulkImport(rows: ImportAccountRowDto[], user: AuthUser) {
    const created: any[] = [];
    const errors: { row: number; domain?: string; message: string }[] = [];
    const seenDomains = new Set<string>();
    const stages = await this.prisma.accountStage.findMany();
    const stageByName = new Map(stages.map((s) => [s.name.toLowerCase(), s.id]));
    const defaultStageId = stages.find((s) => s.isDefault)?.id ?? stages[0]?.id;

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
        const { stageName, ...rest } = row;
        const stageId = (stageName && stageByName.get(stageName.toLowerCase())) || defaultStageId;
        if (!stageId) throw new Error('No company stages configured');
        const account = await this.prisma.account.create({ data: { ...rest, stageId, ownerId: user.id } });
        created.push(account);
      } catch (e: any) {
        errors.push({ row: i + 1, domain: row.domain, message: e.message ?? 'Unknown error' });
      }
    }
    return { created, errors, summary: { total: rows.length, createdCount: created.length, errorCount: errors.length } };
  }
}
