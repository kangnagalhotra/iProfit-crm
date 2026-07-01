import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // powers reminder/inactivity cron jobs
    AuthModule,
    LeadsModule,
    // TasksModule, OpportunitiesModule, ActivitiesModule, AccountsModule,
    // NotificationsModule — same pattern as LeadsModule (see docs)
  ],
})
export class AppModule {}
