import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import {
  CreateTaskDto, UpdateTaskDto, ListTasksQuery, BulkStatusDto, BulkOwnerDto, BulkDeleteDto, BulkImportTasksDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('tasks')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Post()
  create(@Body() dto: CreateTaskDto, @CurrentUser() user) {
    return this.tasks.create(dto, user);
  }

  @Post('import')
  import_(@Body() dto: BulkImportTasksDto, @CurrentUser() user) {
    return this.tasks.bulkImport(dto.rows, user);
  }

  @Get('summary')
  summary(@CurrentUser() user) {
    return this.tasks.summary(user);
  }

  @Get()
  findAll(@Query() query: ListTasksQuery, @CurrentUser() user) {
    if (query.leadId || query.accountId || query.opportunityId) {
      return this.tasks.findFor(query.leadId, query.accountId, query.opportunityId, user);
    }
    return this.tasks.findAllForUser(query, user);
  }

  @Patch('bulk/status')
  bulkStatus(@Body() dto: BulkStatusDto, @CurrentUser() user) {
    return this.tasks.bulkUpdateStatus(dto.ids, dto.status, user);
  }

  @Patch('bulk/owner')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  bulkOwner(@Body() dto: BulkOwnerDto, @CurrentUser() user) {
    return this.tasks.bulkUpdateOwner(dto.ids, dto.ownerId, user);
  }

  @Post('bulk/delete')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  bulkDelete(@Body() dto: BulkDeleteDto, @CurrentUser() user) {
    return this.tasks.bulkDelete(dto.ids, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user) {
    return this.tasks.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user) {
    return this.tasks.update(id, dto, user);
  }

  @Patch(':id/complete')
  complete(@Param('id') id: string, @CurrentUser() user) {
    return this.tasks.complete(id, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.tasks.remove(id, user);
  }
}
