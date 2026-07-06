import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateStageDto, UpdateStageDto } from './dto';

@Injectable()
export class AccountStagesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.accountStage.findMany({ orderBy: { order: 'asc' } });
  }

  async create(dto: CreateStageDto) {
    const max = await this.prisma.accountStage.aggregate({ _max: { order: true } });
    return this.prisma.accountStage.create({
      data: { name: dto.name, color: dto.color, order: (max._max.order ?? 0) + 1 },
    });
  }

  async update(id: string, dto: UpdateStageDto) {
    const stage = await this.prisma.accountStage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Stage not found');
    return this.prisma.accountStage.update({ where: { id }, data: dto });
  }

  async reorder(orderedIds: string[]) {
    await this.prisma.$transaction(
      orderedIds.map((id, i) => this.prisma.accountStage.update({ where: { id }, data: { order: i + 1 } })),
    );
    return this.findAll();
  }

  async remove(id: string) {
    const stage = await this.prisma.accountStage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Stage not found');
    const accountCount = await this.prisma.account.count({ where: { stageId: id } });
    if (accountCount > 0) {
      throw new ConflictException(`Cannot delete "${stage.name}" — ${accountCount} compan${accountCount === 1 ? 'y' : 'ies'} still in this stage. Move them first.`);
    }
    return this.prisma.accountStage.delete({ where: { id } });
  }
}
