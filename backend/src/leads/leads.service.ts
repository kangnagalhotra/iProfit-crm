import {
  Injectable, NotFoundException, ConflictException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AssignmentService } from './assignment.service';
import { CreateLeadDto, UpdateLeadDto, ListLeadsQuery } from './dto';
import { Role } from '@prisma/client';

interface AuthUser { id: string; role: Role; }

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService, private assignment: AssignmentService) {}

  // Reps see their own leads; managers and admins see everything.
  private scopeWhere(user: AuthUser) {
    return user.role === Role.SALES_REP ? { ownerId: user.id } : {};
  }

  async create(dto: CreateLeadDto, user: AuthUser) {
    if (dto.email) {
      const dupe = await this.prisma.lead.findUnique({ where: { email: dto.email } });
      if (dupe) throw new ConflictException({ message: 'Lead with this email exists', existingId: dupe.id });
    }
    // Auto-assign if no owner provided.
    const ownerId = dto.ownerId ?? (await this.assignment.pickOwner()) ?? user.id;
    return this.prisma.lead.create({
      data: { ...dto, ownerId, lastActivityAt: new Date() },
    });
  }

  async findAll(query: ListLeadsQuery, user: AuthUser) {
    const page = Math.max(1, parseInt(query.page ?? '1', 10));
    const pageSize = Math.min(100, parseInt(query.pageSize ?? '25', 10));
    const where: any = { ...this.scopeWhere(user) };
    if (query.status) where.status = query.status;
    if (query.ownerId && user.role !== Role.SALES_REP) where.ownerId = query.ownerId;
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search } },
        { lastName: { contains: query.search } },
        { email: { contains: query.search } },
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.lead.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: { owner: { select: { id: true, fullName: true } }, account: { select: { id: true, name: true } } },
      }),
      this.prisma.lead.count({ where }),
    ]);
    return { data: rows, page, pageSize, total };
  }

  async findOne(id: string, user: AuthUser) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { owner: true, account: true, activities: true, tasks: true },
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
    return this.prisma.lead.update({ where: { id: lead.id }, data: dto });
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
}
