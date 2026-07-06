import {
  Injectable, NotFoundException, ForbiddenException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CreateOpportunityDto, UpdateOpportunityDto, ListOpportunitiesQuery, ImportOpportunityRowDto,
} from './dto';
import { Role } from '@prisma/client';
import { formatChange } from '../activities/format-field-change';

interface AuthUser { id: string; role: Role; }

const SORTABLE_FIELDS = new Set(['name', 'amount', 'closeDate', 'updatedAt', 'createdAt']);

// Every endpoint that returns an Opportunity includes the same relations, so the
// frontend can trust a consistent shape whether it came from create/update/list/get.
const DEAL_INCLUDE = {
  owner: { select: { id: true, fullName: true } },
  account: { select: { id: true, name: true } },
  lead: { select: { id: true, firstName: true, lastName: true, email: true } },
  stage: true,
  pipeline: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OpportunitiesService {
  constructor(private prisma: PrismaService) {}

  private scopeWhere(user: AuthUser) {
    return user.role === Role.SALES_REP ? { ownerId: user.id } : {};
  }

  private async defaultPipelineId(): Promise<string> {
    const pipeline = await this.prisma.pipeline.findFirst({ where: { isDefault: true } });
    if (!pipeline) throw new ConflictException('No default pipeline configured');
    return pipeline.id;
  }

  private async defaultStageId(pipelineId: string): Promise<string> {
    const stage = await this.prisma.stage.findFirst({ where: { pipelineId, isDefault: true } });
    if (!stage) throw new ConflictException('No default deal stage configured');
    return stage.id;
  }

  // Links an existing Account by name, or creates one — same convention as LeadsService.
  private async resolveCompany(companyName: string, ownerId: string): Promise<string> {
    const existing = await this.prisma.account.findFirst({ where: { name: { equals: companyName } } });
    if (existing) return existing.id;
    const defaultStage = await this.prisma.accountStage.findFirstOrThrow({ where: { isDefault: true } });
    const created = await this.prisma.account.create({
      data: { name: companyName, ownerId, stageId: defaultStage.id },
    });
    return created.id;
  }

  async create(dto: CreateOpportunityDto, user: AuthUser) {
    const ownerId = dto.ownerId ?? user.id;
    const { companyName, closeDate, ...rest } = dto;
    const accountId = dto.accountId ?? (companyName ? await this.resolveCompany(companyName, ownerId) : undefined);
    const pipelineId = await this.defaultPipelineId();
    const stageId = dto.stageId ?? (await this.defaultStageId(pipelineId));
    return this.prisma.opportunity.create({
      data: {
        ...rest, ownerId, accountId, pipelineId, stageId, closeDate: closeDate ? new Date(closeDate) : undefined,
      },
      include: DEAL_INCLUDE,
    });
  }

  async findAll(query: ListOpportunitiesQuery, user: AuthUser) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, parseInt(query.pageSize ?? '25', 10));
    const where: any = { ...this.scopeWhere(user) };
    if (query.stageId) where.stageId = query.stageId;
    if (query.ownerId && user.role !== Role.SALES_REP) where.ownerId = query.ownerId;
    if (query.createdAfter) where.createdAt = { gte: new Date(query.createdAfter) };
    if (query.search) {
      where.OR = [{ name: { contains: query.search } }];
    }
    const dir: 'asc' | 'desc' = query.sortDir === 'asc' ? 'asc' : 'desc';
    let orderBy: any = { updatedAt: 'desc' };
    if (query.sortBy === 'stage') orderBy = { stage: { order: dir } };
    else if (SORTABLE_FIELDS.has(query.sortBy ?? '')) orderBy = { [query.sortBy as string]: dir };
    const [rows, total] = await Promise.all([
      this.prisma.opportunity.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy, include: DEAL_INCLUDE,
      }),
      this.prisma.opportunity.count({ where }),
    ]);
    return { data: rows, page, pageSize, total };
  }

  async findOne(id: string, user: AuthUser) {
    const deal = await this.prisma.opportunity.findUnique({
      where: { id },
      include: { ...DEAL_INCLUDE, activities: true, tasks: true },
    });
    if (!deal) throw new NotFoundException('Deal not found');
    if (user.role === Role.SALES_REP && deal.ownerId !== user.id) {
      throw new ForbiddenException('You can only view your own deals');
    }
    return deal;
  }

  async update(id: string, dto: UpdateOpportunityDto, user: AuthUser) {
    const deal = await this.findOne(id, user);
    if (user.role === Role.SALES_REP && dto.ownerId && dto.ownerId !== user.id) {
      throw new ForbiddenException('Reps cannot reassign deals');
    }
    const { companyName, closeDate, ...rest } = dto;
    const accountId = dto.accountId
      ?? (companyName ? await this.resolveCompany(companyName, deal.ownerId ?? user.id) : undefined);

    const changes: string[] = [];
    if (dto.ownerId !== undefined && dto.ownerId !== deal.ownerId) {
      const newOwner = dto.ownerId
        ? await this.prisma.user.findUnique({ where: { id: dto.ownerId }, select: { fullName: true } })
        : null;
      const msg = formatChange('Owner', deal.owner?.fullName, newOwner?.fullName);
      if (msg) changes.push(msg);
    }
    if (dto.stageId !== undefined && dto.stageId !== deal.stageId) {
      const newStage = await this.prisma.stage.findUnique({ where: { id: dto.stageId }, select: { name: true } });
      const msg = formatChange('Stage', deal.stage?.name, newStage?.name);
      if (msg) changes.push(msg);
    }
    if (dto.amount !== undefined && String(dto.amount) !== String(deal.amount ?? '')) {
      const msg = formatChange('Amount', deal.amount?.toString(), String(dto.amount));
      if (msg) changes.push(msg);
    }

    const updated = await this.prisma.opportunity.update({
      where: { id: deal.id },
      data: {
        ...rest,
        ...(accountId ? { accountId } : {}),
        ...(closeDate ? { closeDate: new Date(closeDate) } : {}),
      },
      include: DEAL_INCLUDE,
    });

    if (changes.length) {
      await this.prisma.activity.create({
        data: {
          type: 'FIELD_UPDATE', body: changes.join('\n'), creatorId: user.id, opportunityId: deal.id,
        },
      });
    }

    return updated;
  }

  async remove(id: string, user: AuthUser) {
    const deal = await this.findOne(id, user);
    return this.prisma.opportunity.delete({ where: { id: deal.id } });
  }

  async bulkUpdateStage(ids: string[], stageId: string, user: AuthUser) {
    const stage = await this.prisma.stage.findUnique({ where: { id: stageId } });
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
  async bulkImport(rows: ImportOpportunityRowDto[], user: AuthUser) {
    const created: any[] = [];
    const errors: { row: number; name?: string; message: string }[] = [];
    const pipelineId = await this.defaultPipelineId();
    const stages = await this.prisma.stage.findMany({ where: { pipelineId } });
    const stageByName = new Map(stages.map((s) => [s.name.toLowerCase(), s.id]));
    const defaultStageId = stages.find((s) => s.isDefault)?.id ?? stages[0]?.id;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const { stageName, companyName, closeDate, ...rest } = row;
        const stageId = (stageName && stageByName.get(stageName.toLowerCase())) || defaultStageId;
        if (!stageId) throw new Error('No deal stages configured');
        const accountId = companyName ? await this.resolveCompany(companyName, user.id) : undefined;
        const deal = await this.prisma.opportunity.create({
          data: {
            ...rest, stageId, pipelineId, ownerId: user.id, accountId, closeDate: closeDate ? new Date(closeDate) : undefined,
          },
        });
        created.push(deal);
      } catch (e: any) {
        errors.push({ row: i + 1, name: row.name, message: e.message ?? 'Unknown error' });
      }
    }
    return { created, errors, summary: { total: rows.length, createdCount: created.length, errorCount: errors.length } };
  }
}
