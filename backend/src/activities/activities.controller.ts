import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto, UpdateActivityDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('activities')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ActivitiesController {
  constructor(private activities: ActivitiesService) {}

  @Post()
  create(@Body() dto: CreateActivityDto, @CurrentUser() user) {
    return this.activities.create(dto, user);
  }

  @Get()
  findAll(
    @Query('leadId') leadId: string,
    @Query('accountId') accountId: string,
    @Query('opportunityId') opportunityId: string,
    @Query('taskId') taskId: string,
    @CurrentUser() user,
  ) {
    return this.activities.findFor(leadId, accountId, opportunityId, taskId, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateActivityDto, @CurrentUser() user) {
    return this.activities.update(id, dto.body, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.activities.remove(id, user);
  }
}
