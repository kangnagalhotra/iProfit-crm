import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateStageDto, UpdateStageDto } from './dto';

@Injectable()
export class LeadStagesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.leadStage.findMany({ orderBy: { order: 'asc' } });
  }

  async create(dto: CreateStageDto) {
    const max = await this.prisma.leadStage.aggregate({ _max: { order: true } });
    return this.prisma.leadStage.create({
      data: { name: dto.name, color: dto.color, order: (max._max.order ?? 0) + 1 },
    });
  }

  async update(id: string, dto: UpdateStageDto) {
    const stage = await this.prisma.leadStage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Stage not found');
    return this.prisma.leadStage.update({ where: { id }, data: dto });
  }

  async reorder(orderedIds: string[]) {
    await this.prisma.$transaction(
      orderedIds.map((id, i) => this.prisma.leadStage.update({ where: { id }, data: { order: i + 1 } })),
    );
    return this.findAll();
  }

  async remove(id: string) {
    const stage = await this.prisma.leadStage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Stage not found');
    const leadCount = await this.prisma.lead.count({ where: { stageId: id } });
    if (leadCount > 0) {
      throw new ConflictException(`Cannot delete "${stage.name}" — ${leadCount} lead(s) still in this stage. Move them first.`);
    }
    return this.prisma.leadStage.delete({ where: { id } });
  }
}
