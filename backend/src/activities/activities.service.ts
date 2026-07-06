import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateActivityDto } from './dto';
import { Role } from '@prisma/client';

interface AuthUser { id: string; role: Role; }

@Injectable()
export class ActivitiesService {
  constructor(private prisma: PrismaService) {}

  // Notes/activities inherit the same ownership scoping as the record they hang off —
  // queried directly here rather than depending on LeadsService/AccountsService to
  // avoid a cross-module dependency for a single ownerId check.
  private async assertAccess(
    leadId: string | undefined,
    accountId: string | undefined,
    opportunityId: string | undefined,
    taskId: string | undefined,
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
    if (taskId) {
      const task = await this.prisma.task.findUnique({ where: { id: taskId } });
      if (!task) throw new NotFoundException('Task not found');
      if (user.role === Role.SALES_REP && task.assigneeId !== user.id) {
        throw new ForbiddenException('You can only access your own tasks');
      }
    }
  }

  async create(dto: CreateActivityDto, user: AuthUser) {
    if (!dto.leadId && !dto.accountId && !dto.opportunityId && !dto.taskId) {
      throw new BadRequestException('leadId, accountId, opportunityId, or taskId is required');
    }
    await this.assertAccess(dto.leadId, dto.accountId, dto.opportunityId, dto.taskId, user);
    return this.prisma.activity.create({
      data: {
        type: dto.type,
        body: dto.body,
        leadId: dto.leadId,
        accountId: dto.accountId,
        opportunityId: dto.opportunityId,
        taskId: dto.taskId,
        creatorId: user.id,
      },
      include: { creator: { select: { id: true, fullName: true } } },
    });
  }

  async findFor(
    leadId: string | undefined,
    accountId: string | undefined,
    opportunityId: string | undefined,
    taskId: string | undefined,
    user: AuthUser,
  ) {
    if (!leadId && !accountId && !opportunityId && !taskId) {
      throw new BadRequestException('leadId, accountId, opportunityId, or taskId query param is required');
    }
    await this.assertAccess(leadId, accountId, opportunityId, taskId, user);
    return this.prisma.activity.findMany({
      where: {
        leadId: leadId || undefined,
        accountId: accountId || undefined,
        opportunityId: opportunityId || undefined,
        taskId: taskId || undefined,
      },
      orderBy: { occurredAt: 'desc' },
      include: { creator: { select: { id: true, fullName: true } } },
    });
  }

  async update(id: string, body: string, user: AuthUser) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Note not found');
    if (activity.creatorId !== user.id) throw new ForbiddenException('You can only edit your own notes');
    return this.prisma.activity.update({
      where: { id }, data: { body }, include: { creator: { select: { id: true, fullName: true } } },
    });
  }

  async remove(id: string, user: AuthUser) {
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException('Note not found');
    const isOwnNote = activity.creatorId === user.id;
    const canModerate = user.role === Role.ADMIN || user.role === Role.SALES_MANAGER;
    if (!isOwnNote && !canModerate) throw new ForbiddenException('You can only delete your own notes');
    return this.prisma.activity.delete({ where: { id } });
  }
}
