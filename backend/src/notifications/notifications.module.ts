import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RemindersService } from './reminders.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, RemindersService, PrismaService],
})
export class NotificationsModule {}
