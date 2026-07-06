import { Module } from '@nestjs/common';
import { AccountStagesController } from './account-stages.controller';
import { AccountStagesService } from './account-stages.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [AccountStagesController],
  providers: [AccountStagesService, PrismaService],
  exports: [AccountStagesService],
})
export class AccountStagesModule {}
