import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { AccountsModule } from './accounts/accounts.module';
import { LeadStagesModule } from './lead-stages/lead-stages.module';
import { AccountStagesModule } from './account-stages/account-stages.module';
import { ActivitiesModule } from './activities/activities.module';
import { DealStagesModule } from './deal-stages/deal-stages.module';
import { OpportunitiesModule } from './opportunities/opportunities.module';
import { TasksModule } from './tasks/tasks.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // powers reminder/inactivity cron jobs
    AuthModule,
    LeadsModule,
    AccountsModule,
    LeadStagesModule,
    AccountStagesModule,
    ActivitiesModule,
    DealStagesModule,
    OpportunitiesModule,
    TasksModule,
    NotificationsModule,
  ],
})
export class AppModule {}
