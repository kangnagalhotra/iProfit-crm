import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import {
  CreateOpportunityDto, UpdateOpportunityDto, ListOpportunitiesQuery, BulkImportOpportunitiesDto,
  BulkStageDto, BulkOwnerDto, BulkDeleteDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('deals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OpportunitiesController {
  constructor(private deals: OpportunitiesService) {}

  @Post()
  create(@Body() dto: CreateOpportunityDto, @CurrentUser() user) {
    return this.deals.create(dto, user);
  }

  @Post('import')
  import_(@Body() dto: BulkImportOpportunitiesDto, @CurrentUser() user) {
    return this.deals.bulkImport(dto.rows, user);
  }

  @Get()
  findAll(@Query() query: ListOpportunitiesQuery, @CurrentUser() user) {
    return this.deals.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user) {
    return this.deals.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOpportunityDto, @CurrentUser() user) {
    return this.deals.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.deals.remove(id, user);
  }

  @Patch('bulk/stage')
  bulkStage(@Body() dto: BulkStageDto, @CurrentUser() user) {
    return this.deals.bulkUpdateStage(dto.ids, dto.stageId, user);
  }

  @Patch('bulk/owner')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  bulkOwner(@Body() dto: BulkOwnerDto, @CurrentUser() user) {
    return this.deals.bulkUpdateOwner(dto.ids, dto.ownerId, user);
  }

  @Post('bulk/delete')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  bulkDelete(@Body() dto: BulkDeleteDto, @CurrentUser() user) {
    return this.deals.bulkDelete(dto.ids, user);
  }
}
