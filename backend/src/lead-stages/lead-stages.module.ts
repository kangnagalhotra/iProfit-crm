import { Module } from '@nestjs/common';
import { LeadStagesController } from './lead-stages.controller';
import { LeadStagesService } from './lead-stages.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [LeadStagesController],
  providers: [LeadStagesService, PrismaService],
  exports: [LeadStagesService],
})
export class LeadStagesModule {}
