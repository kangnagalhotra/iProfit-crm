import {
  Body, Controller, Delete, Get, Param, Patch, Post, UseGuards,
} from '@nestjs/common';
import { LeadStagesService } from './lead-stages.service';
import { CreateStageDto, UpdateStageDto, ReorderStagesDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('lead-stages')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadStagesController {
  constructor(private stages: LeadStagesService) {}

  @Get()
  findAll() {
    return this.stages.findAll();
  }

  @Post()
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  create(@Body() dto: CreateStageDto) {
    return this.stages.create(dto);
  }

  @Patch('reorder')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  reorder(@Body() dto: ReorderStagesDto) {
    return this.stages.reorder(dto.orderedIds);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  update(@Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.stages.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  remove(@Param('id') id: string) {
    return this.stages.remove(id);
  }
}
