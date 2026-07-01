import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Lead Assignment Engine.
 * Strategy 1: round-robin across reps flagged inAssignmentPool.
 * State is kept in a tiny key/value-ish approach using the most-recently
 * assigned rep — simple and good enough for a small team. Swap for a
 * rules table later (territory, source, etc.) without touching callers.
 */
@Injectable()
export class AssignmentService {
  private lastIndex = 0;

  constructor(private prisma: PrismaService) {}

  async pickOwner(): Promise<string | null> {
    const pool = await this.prisma.user.findMany({
      where: { isActive: true, inAssignmentPool: true, role: { in: ['SALES_REP', 'SALES_MANAGER'] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (pool.length === 0) return null;
    const owner = pool[this.lastIndex % pool.length];
    this.lastIndex = (this.lastIndex + 1) % pool.length;
    return owner.id;
  }
}
