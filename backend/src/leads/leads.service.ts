import {
  Injectable, NotFoundException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AssignmentService } from './assignment.service';
import { CreateLeadDto, UpdateLeadDto, ListLeadsQuery, ImportLeadRowDto } from './dto';
import { Role } from '@prisma/client';
import { formatChange } from '../activities/format-field-change';

interface AuthUser { id: string; role: Role; }

const SORTABLE_FIELDS = new Set(['firstName', 'lastName', 'value', 'updatedAt', 'createdAt']);

// Every endpoint that returns a Lead includes the same relations, so the
// frontend can trust a consistent shape whether it came from create/update/list/get.
const LEAD_INCLUDE = {
  owner: { select: { id: true, fullName: true } },
  account: { select: { id: true, name: true } },
  stage: true,
} as const;

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService, private assignment: AssignmentService) {}

  // Reps see their own leads; managers and admins see everything.
  private scopeWhere(user: AuthUser) {
    return user.role === Role.SALES_REP ? { ownerId: user.id } : {};
  }

  private async defaultStageId(): Promise<string> {
    const stage = await this.prisma.leadStage.findFirst({ where: { isDefault: true } });
    if (!stage) throw new ConflictException('No default lead stage configured');
    return stage.id;
  }

  // Links an existing Account by name, or creates one — lets the Add Lead form
  // take a plain "Company Name" without a separate create-company step.
  private async resolveCompany(companyName: string, ownerId: string): Promise<string> {
    const existing = await this.prisma.account.findFirst({
      where: { name: { equals: companyName } },
    });
    if (existing) return existing.id;
    const defaultStage = await this.prisma.accountStage.findFirstOrThrow({ where: { isDefault: true } });
    const created = await this.prisma.account.create({
      data: { name: companyName, ownerId, stageId: defaultStage.id },
    });
    return created.id;
  }

  async create(dto: CreateLeadDto, user: AuthUser) {
    if (dto.email) {
      const dupe = await this.prisma.lead.findUnique({ where: { email: dto.email } });
      if (dupe) throw new ConflictException({ message: 'Lead with this email exists', existingId: dupe.id });
    }
    const ownerId = dto.ownerId ?? (await this.assignment.pickOwner()) ?? user.id;
    const { companyName, ...rest } = dto;
    const accountId = dto.accountId ?? (companyName ? await this.resolveCompany(companyName, ownerId) : undefined);
    const stageId = dto.stageId ?? (await this.defaultStageId());
    const leadName = [dto.firstName, dto.lastName].filter(Boolean).join(' ') || undefined;

    const created = await this.prisma.lead.create({
      data: {
        ...rest, leadName, ownerId, accountId, stageId, lastActivityAt: new Date(),
      },
      include: LEAD_INCLUDE,
    });

    const changes = ['Lead created'];
    if (created.account) changes.push(`Linked to company: ${created.account.name}`);
    await this.prisma.activity.create({
      data: {
        type: 'FIELD_UPDATE', body: changes.join('\n'), creatorId: user.id, leadId: created.id,
      },
    });

    return created;
  }

  async findAll(query: ListLeadsQuery, user: AuthUser) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, parseInt(query.pageSize ?? '25', 10));
    const where: any = { ...this.scopeWhere(user) };
    if (query.stageId) where.stageId = query.stageId;
    if (query.ownerId && user.role !== Role.SALES_REP) where.ownerId = query.ownerId;
    if (query.accountId) where.accountId = query.accountId;
    if (query.createdAfter) where.createdAt = { gte: new Date(query.createdAfter) };
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
        { email: { contains: query.search } },
      ];
    }
    const dir: 'asc' | 'desc' = query.sortDir === 'asc' ? 'asc' : 'desc';
    let orderBy: any = { updatedAt: 'desc' };
    if (query.sortBy === 'stage') orderBy = { stage: { order: dir } };
    else if (SORTABLE_FIELDS.has(query.sortBy ?? '')) orderBy = { [query.sortBy as string]: dir };
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy,
        include: {
          owner: { select: { id: true, fullName: true } },
          account: { select: { id: true, name: true } },
          stage: true,
        },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { data: rows, page, pageSize, total };
  }

  async findOne(id: string, user: AuthUser) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        owner: true, account: true, stage: true, activities: true, tasks: true,
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (user.role === Role.SALES_REP && lead.ownerId !== user.id) {
      throw new ForbiddenException('You can only view your own leads');
    }
    return lead;
  }

  async update(id: string, dto: UpdateLeadDto, user: AuthUser) {
    const lead = await this.findOne(id, user); // re-uses scope check
    // reps cannot reassign ownership away from themselves
    if (user.role === Role.SALES_REP && dto.ownerId && dto.ownerId !== user.id) {
      throw new ForbiddenException('Reps cannot reassign leads');
    }
    const { companyName, ...rest } = dto;
    const accountId = dto.accountId
      ?? (companyName ? await this.resolveCompany(companyName, lead.ownerId ?? user.id) : undefined);

    // Lead Name is never user-typed — always regenerate it from the merged effective
    // names so a name-only PATCH stays correct without clobbering it on unrelated edits.
    const leadNameUpdate: { leadName?: string } = {};
    if (dto.firstName !== undefined || dto.lastName !== undefined) {
      const effectiveFirst = dto.firstName ?? lead.firstName;
      const effectiveLast = dto.lastName ?? lead.lastName;
      leadNameUpdate.leadName = [effectiveFirst, effectiveLast].filter(Boolean).join(' ') || undefined;
    }

    const changes: string[] = [];
    if (dto.ownerId !== undefined && dto.ownerId !== lead.ownerId) {
      const newOwner = dto.ownerId
        ? await this.prisma.user.findUnique({ where: { id: dto.ownerId }, select: { fullName: true } })
        : null;
      const msg = formatChange('Owner', lead.owner?.fullName, newOwner?.fullName);
      if (msg) changes.push(msg);
    }
    if (dto.stageId !== undefined && dto.stageId !== lead.stageId) {
      const newStage = await this.prisma.leadStage.findUnique({ where: { id: dto.stageId }, select: { name: true } });
      const msg = formatChange('Stage', lead.stage?.name, newStage?.name);
      if (msg) changes.push(msg);
    }
    if (dto.value !== undefined && String(dto.value) !== String(lead.value ?? '')) {
      const msg = formatChange('Lead Value', lead.value?.toString(), dto.value);
      if (msg) changes.push(msg);
    }
    if (accountId !== undefined && accountId !== lead.accountId) {
      const newAccount = await this.prisma.account.findUnique({ where: { id: accountId }, select: { name: true } });
      const msg = formatChange('Company', lead.account?.name, newAccount?.name);
      if (msg) changes.push(msg);
    }

    const updated = await this.prisma.lead.update({
      where: { id: lead.id }, data: { ...rest, ...leadNameUpdate, ...(accountId ? { accountId } : {}) },
      include: LEAD_INCLUDE,
    });

    if (changes.length) {
      await this.prisma.activity.create({
        data: {
          type: 'FIELD_UPDATE', body: changes.join('\n'), creatorId: user.id, leadId: lead.id,
        },
      });
    }

    return updated;
  }

  async remove(id: string, user: AuthUser) {
    const lead = await this.findOne(id, user);
    return this.prisma.lead.delete({ where: { id: lead.id } });
  }

  // Manual (re)assignment — managers/admins only (enforced at controller).
  async assign(id: string, ownerId: string) {
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) throw new NotFoundException('Target user not found');
    return this.prisma.lead.update({ where: { id }, data: { ownerId } });
  }

  // Bulk operations — thin loops over the existing single-record path so
  // scope/ownership checks stay in one place rather than a parallel bulk auth path.
  async bulkUpdateStage(ids: string[], stageId: string, user: AuthUser) {
    const stage = await this.prisma.leadStage.findUnique({ where: { id: stageId } });
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

  // CSV import — never aborts the whole batch on a single bad row.
  async bulkImport(rows: ImportLeadRowDto[], user: AuthUser) {
    const created: any[] = [];
    const errors: { row: number; email?: string; message: string }[] = [];
    const seenEmails = new Set<string>();
    const stages = await this.prisma.leadStage.findMany();
    const stageByName = new Map(stages.map((s) => [s.name.toLowerCase(), s.id]));
    const defaultStageId = stages.find((s) => s.isDefault)?.id ?? stages[0]?.id;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (row.email) {
          const key = row.email.toLowerCase();
          if (seenEmails.has(key)) {
            errors.push({ row: i + 1, email: row.email, message: 'Duplicate email within import file' });
            continue;
          }
          const dupe = await this.prisma.lead.findUnique({ where: { email: row.email } });
          if (dupe) {
            errors.push({ row: i + 1, email: row.email, message: 'Lead with this email already exists' });
            continue;
          }
          seenEmails.add(key);
        }
        const { stageName, ...rest } = row;
        const stageId = (stageName && stageByName.get(stageName.toLowerCase())) || defaultStageId;
        if (!stageId) throw new Error('No lead stages configured');
        const ownerId = (await this.assignment.pickOwner()) ?? user.id;
        const lead = await this.prisma.lead.create({
          data: {
            ...rest, stageId, source: 'IMPORT', ownerId, lastActivityAt: new Date(),
          },
        });
        created.push(lead);
      } catch (e: any) {
        errors.push({ row: i + 1, email: row.email, message: e.message ?? 'Unknown error' });
      }
    }
    return { created, errors, summary: { total: rows.length, createdCount: created.length, errorCount: errors.length } };
  }
}
