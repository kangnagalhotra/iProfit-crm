import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateLeadDto, UpdateLeadDto, ListLeadsQuery } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(private leads: LeadsService) {}

  @Post()
  create(@Body() dto: CreateLeadDto, @CurrentUser() user) {
    return this.leads.create(dto, user);
  }

  @Get()
  findAll(@Query() query: ListLeadsQuery, @CurrentUser() user) {
    return this.leads.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user) {
    return this.leads.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user) {
    return this.leads.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.leads.remove(id, user);
  }

  @Patch(':id/assign')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  assign(@Param('id') id: string, @Body('ownerId') ownerId: string) {
    return this.leads.assign(id, ownerId);
  }
}
