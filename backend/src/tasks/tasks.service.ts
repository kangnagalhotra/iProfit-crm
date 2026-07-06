import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  CreateTaskDto, UpdateTaskDto, ListTasksQuery, ImportTaskRowDto,
} from './dto';
import { Role } from '@prisma/client';
import { formatChange } from '../activities/format-field-change';

interface AuthUser { id: string; role: Role; }

const STATUS_BY_NAME = new Map([
  ['not started', 'NOT_STARTED'],
  ['in progress', 'IN_PROGRESS'],
  ['waiting', 'WAITING'],
  ['completed', 'COMPLETED'],
  ['cancelled', 'CANCELLED'],
]);

const TASK_INCLUDE = {
  assignee: { select: { id: true, fullName: true } },
  lead: { select: { id: true, firstName: true, lastName: true, email: true } },
  account: { select: { id: true, name: true } },
  opportunity: { select: { id: true, name: true } },
} as const;

const SORTABLE_FIELDS = new Set(['title', 'dueAt', 'priority', 'status', 'createdAt', 'updatedAt']);
const OPEN_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'WAITING'];

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  private async assertAccess(
    leadId: string | undefined,
    accountId: string | undefined,
    opportunityId: string | undefined,
    user: AuthUser,
  ) {
    if (leadId) {
      const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new NotFoundException('Lead not found');
      if (user.role === Role.SALES_REP && lead.ownerId !== user.id) {
        throw new ForbiddenException('You can only access your own leads');
      }
    }
    if (accountId) {
      const account = await this.prisma.account.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundException('Company not found');
      if (user.role === Role.SALES_REP && account.ownerId !== user.id) {
        throw new ForbiddenException('You can only access your own companies');
      }
    }
    if (opportunityId) {
      const deal = await this.prisma.opportunity.findUnique({ where: { id: opportunityId } });
      if (!deal) throw new NotFoundException('Deal not found');
      if (user.role === Role.SALES_REP && deal.ownerId !== user.id) {
        throw new ForbiddenException('You can only access your own deals');
      }
    }
  }

  private canManage(task: { assigneeId: string | null }, user: AuthUser) {
    return user.role === Role.ADMIN || user.role === Role.SALES_MANAGER || task.assigneeId === user.id;
  }

  async create(dto: CreateTaskDto, user: AuthUser) {
    // Tasks may stand alone (created from the global dashboard) or be linked to a
    // Lead/Company/Deal (created from a detail page widget or the dashboard's related-record picker).
    await this.assertAccess(dto.leadId, dto.accountId, dto.opportunityId, user);
    const task = await this.prisma.task.create({
      data: {
        title: dto.title,
        type: dto.type,
        priority: dto.priority,
        status: dto.status,
        dueAt: new Date(dto.dueAt),
        notes: dto.notes,
        reminderAt: dto.reminderAt ? new Date(dto.reminderAt) : undefined,
        completedAt: dto.status === 'COMPLETED' ? new Date() : undefined,
        assigneeId: dto.assigneeId ?? user.id,
        leadId: dto.leadId,
        accountId: dto.accountId,
        opportunityId: dto.opportunityId,
      },
      include: TASK_INCLUDE,
    });
    await this.prisma.activity.create({
      data: {
        type: 'FIELD_UPDATE', body: 'Task created', creatorId: user.id, taskId: task.id,
      },
    });
    return task;
  }

  async findOne(id: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!task) throw new NotFoundException('Task not found');
    if (user.role === Role.SALES_REP && task.assigneeId !== user.id) {
      throw new ForbiddenException('You can only view your own tasks');
    }
    return task;
  }

  async findFor(
    leadId: string | undefined,
    accountId: string | undefined,
    opportunityId: string | undefined,
    user: AuthUser,
  ) {
    if (!leadId && !accountId && !opportunityId) {
      throw new BadRequestException('leadId, accountId, or opportunityId query param is required');
    }
    await this.assertAccess(leadId, accountId, opportunityId, user);
    return this.prisma.task.findMany({
      where: {
        leadId: leadId || undefined,
        accountId: accountId || undefined,
        opportunityId: opportunityId || undefined,
      },
      orderBy: { dueAt: 'asc' },
      include: TASK_INCLUDE,
    });
  }

  private dueFilterRange(dueFilter: 'today' | 'overdue' | 'upcoming' | undefined) {
    if (!dueFilter) return undefined;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    if (dueFilter === 'overdue') return { dueAt: { lt: now }, status: { notIn: ['COMPLETED', 'CANCELLED'] } };
    if (dueFilter === 'today') return { dueAt: { gte: startOfToday, lt: startOfTomorrow }, status: { notIn: ['COMPLETED', 'CANCELLED'] } };
    return { dueAt: { gte: startOfTomorrow }, status: { notIn: ['COMPLETED', 'CANCELLED'] } }; // upcoming
  }

  async findAllForUser(query: ListTasksQuery, user: AuthUser) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, parseInt(query.pageSize ?? '25', 10));
    const where: any = { ...this.dueFilterRange(query.dueFilter) };
    if (user.role === Role.SALES_REP) {
      where.assigneeId = user.id;
    } else if (query.assigneeId) {
      where.assigneeId = query.assigneeId;
    }
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.search) {
      where.OR = [{ title: { contains: query.search } }, { notes: { contains: query.search } }];
    }
    const dir: 'asc' | 'desc' = query.sortDir === 'desc' ? 'desc' : 'asc';
    const orderBy = SORTABLE_FIELDS.has(query.sortBy ?? '') ? { [query.sortBy as string]: dir } : { dueAt: 'asc' as const };
    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize, orderBy, include: TASK_INCLUDE,
      }),
      this.prisma.task.count({ where }),
    ]);
    return {
      data: rows, page, pageSize, total,
    };
  }

  async summary(user: AuthUser) {
    const scope = user.role === Role.SALES_REP ? { assigneeId: user.id } : {};
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const [total, open, completed, overdue, dueToday] = await Promise.all([
      this.prisma.task.count({ where: scope }),
      this.prisma.task.count({ where: { ...scope, status: { in: OPEN_STATUSES as any } } }),
      this.prisma.task.count({ where: { ...scope, status: 'COMPLETED' } }),
      this.prisma.task.count({
        where: {
          ...scope, dueAt: { lt: now }, status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
      this.prisma.task.count({
        where: {
          ...scope, dueAt: { gte: startOfToday, lt: startOfTomorrow }, status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      }),
    ]);
    return {
      total, open, completed, overdue, dueToday,
    };
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthUser) {
    const task = await this.prisma.task.findUnique({
      where: { id }, include: { assignee: { select: { fullName: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    if (!this.canManage(task, user)) throw new ForbiddenException('You can only edit your own tasks');
    const {
      dueAt, reminderAt, status, ...rest
    } = dto;
    const data: any = {
      ...rest,
      ...(dueAt ? { dueAt: new Date(dueAt) } : {}),
      ...(reminderAt ? { reminderAt: new Date(reminderAt) } : {}),
    };
    if (status) {
      data.status = status;
      if (status === 'COMPLETED' && task.status !== 'COMPLETED') data.completedAt = new Date();
      else if (status !== 'COMPLETED' && task.status === 'COMPLETED') data.completedAt = null;
    }

    const changes: string[] = [];
    if (status !== undefined && status !== task.status) {
      const msg = formatChange('Status', task.status.replace('_', ' '), status.replace('_', ' '));
      if (msg) changes.push(msg);
    }
    if (dto.assigneeId !== undefined && dto.assigneeId !== task.assigneeId) {
      const newAssignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId }, select: { fullName: true } });
      const msg = formatChange('Owner', task.assignee?.fullName, newAssignee?.fullName);
      if (msg) changes.push(msg);
    }
    if (dueAt !== undefined && new Date(dueAt).getTime() !== task.dueAt.getTime()) {
      const msg = formatChange('Due date', task.dueAt.toLocaleDateString(), new Date(dueAt).toLocaleDateString());
      if (msg) changes.push(msg);
    }

    const updated = await this.prisma.task.update({
      where: { id },
      data,
      include: TASK_INCLUDE,
    });

    if (changes.length) {
      await this.prisma.activity.create({
        data: {
          type: 'FIELD_UPDATE', body: changes.join('\n'), creatorId: user.id, taskId: task.id,
        },
      });
    }

    return updated;
  }

  async remove(id: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (!this.canManage(task, user)) throw new ForbiddenException('You can only delete your own tasks');
    return this.prisma.task.delete({ where: { id } });
  }

  async complete(id: string, user: AuthUser) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    if (!this.canManage(task, user)) throw new ForbiddenException('You can only complete your own tasks');
    const updated = await this.prisma.task.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
      include: TASK_INCLUDE,
    });
    if (task.status !== 'COMPLETED') {
      const msg = formatChange('Status', task.status.replace('_', ' '), 'Completed');
      if (msg) {
        await this.prisma.activity.create({
          data: {
            type: 'FIELD_UPDATE', body: msg, creatorId: user.id, taskId: task.id,
          },
        });
      }
    }
    return updated;
  }

  async bulkUpdateStatus(ids: string[], status: string, user: AuthUser) {
    const results = await Promise.allSettled(ids.map((id) => this.update(id, { status: status as any }, user)));
    return this.summarizeBulk(results);
  }

  async bulkUpdateOwner(ids: string[], assigneeId: string, user: AuthUser) {
    const results = await Promise.allSettled(ids.map((id) => this.update(id, { assigneeId }, user)));
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
  async bulkImport(rows: ImportTaskRowDto[], user: AuthUser) {
    const created: any[] = [];
    const errors: { row: number; title?: string; message: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const {
          statusName, relatedModule, relatedRecordName, ...rest
        } = row;
        const status = statusName ? STATUS_BY_NAME.get(statusName.toLowerCase()) : undefined;

        let leadId: string | undefined;
        let accountId: string | undefined;
        let opportunityId: string | undefined;
        if (relatedModule && relatedRecordName) {
          if (relatedModule === 'lead') {
            const lead = await this.prisma.lead.findFirst({
              where: { OR: [{ email: relatedRecordName }, { leadName: relatedRecordName }] },
            });
            if (!lead) throw new Error(`Lead "${relatedRecordName}" not found`);
            leadId = lead.id;
          } else if (relatedModule === 'account') {
            const account = await this.prisma.account.findFirst({ where: { name: relatedRecordName } });
            if (!account) throw new Error(`Company "${relatedRecordName}" not found`);
            accountId = account.id;
          } else if (relatedModule === 'opportunity') {
            const deal = await this.prisma.opportunity.findFirst({ where: { name: relatedRecordName } });
            if (!deal) throw new Error(`Deal "${relatedRecordName}" not found`);
            opportunityId = deal.id;
          }
        }

        const task = await this.prisma.task.create({
          data: {
            ...rest,
            dueAt: new Date(rest.dueAt),
            status: status as any,
            assigneeId: user.id,
            leadId,
            accountId,
            opportunityId,
          },
        });
        created.push(task);
      } catch (e: any) {
        errors.push({ row: i + 1, title: row.title, message: e.message ?? 'Unknown error' });
      }
    }
    return { created, errors, summary: { total: rows.length, createdCount: created.length, errorCount: errors.length } };
  }
}
