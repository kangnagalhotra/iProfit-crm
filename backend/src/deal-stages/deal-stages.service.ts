import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateStageDto, UpdateStageDto } from './dto';

@Injectable()
export class DealStagesService {
  constructor(private prisma: PrismaService) {}

  private async defaultPipelineId(): Promise<string> {
    const pipeline = await this.prisma.pipeline.findFirst({ where: { isDefault: true } });
    if (!pipeline) throw new ConflictException('No default pipeline configured');
    return pipeline.id;
  }

  async findAll() {
    const pipelineId = await this.defaultPipelineId();
    return this.prisma.stage.findMany({ where: { pipelineId }, orderBy: { order: 'asc' } });
  }

  async create(dto: CreateStageDto) {
    const pipelineId = await this.defaultPipelineId();
    const max = await this.prisma.stage.aggregate({ where: { pipelineId }, _max: { order: true } });
    return this.prisma.stage.create({
      data: {
        pipelineId, name: dto.name, color: dto.color, order: (max._max.order ?? 0) + 1,
      },
    });
  }

  async update(id: string, dto: UpdateStageDto) {
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Stage not found');
    return this.prisma.stage.update({ where: { id }, data: dto });
  }

  async reorder(orderedIds: string[]) {
    await this.prisma.$transaction(
      orderedIds.map((id, i) => this.prisma.stage.update({ where: { id }, data: { order: i + 1 } })),
    );
    return this.findAll();
  }

  async remove(id: string) {
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Stage not found');
    const dealCount = await this.prisma.opportunity.count({ where: { stageId: id } });
    if (dealCount > 0) {
      throw new ConflictException(`Cannot delete "${stage.name}" — ${dealCount} deal(s) still in this stage. Move them first.`);
    }
    return this.prisma.stage.delete({ where: { id } });
  }
}
