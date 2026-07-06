import { Module } from '@nestjs/common';
import { DealStagesController } from './deal-stages.controller';
import { DealStagesService } from './deal-stages.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [DealStagesController],
  providers: [DealStagesService, PrismaService],
  exports: [DealStagesService],
})
export class DealStagesModule {}
