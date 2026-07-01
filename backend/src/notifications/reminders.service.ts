import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma.service';

/**
 * Automation jobs (run via @nestjs/schedule).
 *  - Follow-up reminders: tasks whose reminderAt has passed and are still pending.
 *  - Lead inactivity alerts: leads with no activity in 7+ days.
 * Both write Notification rows that the frontend bell polls.
 */
@Injectable()
export class RemindersService {
  private readonly log = new Logger(RemindersService.name);
  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sendDueReminders() {
    const now = new Date();
    const due = await this.prisma.task.findMany({
      where: { status: 'PENDING', reminderAt: { lte: now } },
    });
    for (const task of due) {
      await this.prisma.notification.create({
        data: {
          userId: task.assigneeId,
          type: 'TASK_DUE',
          message: `Reminder: "${task.title}" is due`,
          linkUrl: `/tasks/${task.id}`,
        },
      });
      // clear reminder so it fires once
      await this.prisma.task.update({ where: { id: task.id }, data: { reminderAt: null } });
    }
    if (due.length) this.log.log(`Sent ${due.length} task reminders`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async flagInactiveLeads() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const stale = await this.prisma.lead.findMany({
      where: {
        status: { notIn: ['UNQUALIFIED'] },
        lastActivityAt: { lt: sevenDaysAgo },
        ownerId: { not: null },
      },
    });
    for (const lead of stale) {
      await this.prisma.notification.create({
        data: {
          userId: lead.ownerId!,
          type: 'LEAD_INACTIVE',
          message: `Lead ${lead.firstName ?? lead.email ?? lead.id} has had no activity in 7+ days`,
          linkUrl: `/leads/${lead.id}`,
        },
      });
    }
    if (stale.length) this.log.log(`Flagged ${stale.length} inactive leads`);
  }
}
