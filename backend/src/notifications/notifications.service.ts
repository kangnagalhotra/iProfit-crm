import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Role } from '@prisma/client';

interface AuthUser { id: string; role: Role; }

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  findForUser(user: AuthUser) {
    return this.prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(id: string, user: AuthUser) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== user.id) throw new ForbiddenException('You can only manage your own notifications');
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllRead(user: AuthUser) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }
}
