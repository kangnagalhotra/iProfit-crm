import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { AccountsService } from './accounts.service';
import {
  CreateAccountDto, UpdateAccountDto, ListAccountsQuery, BulkImportAccountsDto,
  BulkStageDto, BulkOwnerDto, BulkDeleteDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('accounts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AccountsController {
  constructor(private accounts: AccountsService) {}

  @Post()
  create(@Body() dto: CreateAccountDto, @CurrentUser() user) {
    return this.accounts.create(dto, user);
  }

  @Post('import')
  import_(@Body() dto: BulkImportAccountsDto, @CurrentUser() user) {
    return this.accounts.bulkImport(dto.rows, user);
  }

  @Get()
  findAll(@Query() query: ListAccountsQuery, @CurrentUser() user) {
    return this.accounts.findAll(query, user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user) {
    return this.accounts.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAccountDto, @CurrentUser() user) {
    return this.accounts.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  remove(@Param('id') id: string, @CurrentUser() user) {
    return this.accounts.remove(id, user);
  }

  @Patch('bulk/stage')
  bulkStage(@Body() dto: BulkStageDto, @CurrentUser() user) {
    return this.accounts.bulkUpdateStage(dto.ids, dto.stageId, user);
  }

  @Patch('bulk/owner')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  bulkOwner(@Body() dto: BulkOwnerDto, @CurrentUser() user) {
    return this.accounts.bulkUpdateOwner(dto.ids, dto.ownerId, user);
  }

  @Post('bulk/delete')
  @Roles(Role.ADMIN, Role.SALES_MANAGER)
  bulkDelete(@Body() dto: BulkDeleteDto, @CurrentUser() user) {
    return this.accounts.bulkDelete(dto.ids, user);
  }
}
