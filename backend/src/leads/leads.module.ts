import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { AssignmentService } from './assignment.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, AssignmentService, PrismaService],
})
export class LeadsModule {}
