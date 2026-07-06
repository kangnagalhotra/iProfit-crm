import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const pwd = await bcrypt.hash('Password123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@iprofit.com' },
    update: {},
    create: { fullName: 'Karamvir Rao', email: 'admin@iprofit.com', passwordHash: pwd, role: Role.ADMIN },
  });
  const rep = await prisma.user.upsert({
    where: { email: 'rep@iprofit.com' },
    update: {},
    create: { fullName: 'Harjot Singh', email: 'rep@iprofit.com', passwordHash: pwd, role: Role.SALES_REP },
  });

  // default pipeline + stages — neither has a unique key to upsert on, so find-or-create
  let pipeline = await prisma.pipeline.findFirst({ where: { name: 'Sales Pipeline' } });
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        name: 'Sales Pipeline', isDefault: true,
        stages: {
          create: [
            { name: 'Lead', order: 1, color: '#025ADF', isDefault: true, winProbability: 10 },
            { name: 'Discovery', order: 2, color: '#0EA5E9', winProbability: 20 },
            { name: 'Qualified', order: 3, color: '#8B5CF6', winProbability: 35 },
            { name: 'Proposal', order: 4, color: '#F59E0B', winProbability: 55 },
            { name: 'Negotiation', order: 5, color: '#F97316', winProbability: 70 },
            { name: 'Verbal Commit', order: 6, color: '#EAB308', winProbability: 90 },
            { name: 'Won', order: 7, color: '#16A34A', winProbability: 100, isClosedWon: true },
            { name: 'Lost', order: 8, color: '#DC2626', winProbability: 0, isClosedLost: true },
          ],
        },
      },
    });
  }

  // default account stages — configurable board columns (rename/reorder/delete via /account-stages)
  const accountStageCount = await prisma.accountStage.count();
  if (accountStageCount === 0) {
    await prisma.accountStage.createMany({
      data: [
        { name: 'Prospect', order: 1, color: '#025ADF', isDefault: true },
        { name: 'Qualified', order: 2, color: '#8B5CF6' },
        { name: 'Active Customer', order: 3, color: '#16A34A' },
        { name: 'Strategic Account', order: 4, color: '#F59E0B' },
        { name: 'On Hold', order: 5, color: '#6b7280' },
        { name: 'Inactive', order: 6, color: '#DC2626' },
      ],
    });
  }
  const defaultAccountStage = await prisma.accountStage.findFirstOrThrow({ where: { isDefault: true } });

  let acme = await prisma.account.findFirst({ where: { domain: 'acmefoods.com' } });
  if (!acme) {
    acme = await prisma.account.create({
      data: {
        name: 'Acme Foods', domain: 'acmefoods.com', industry: 'Food & Beverage',
        stageId: defaultAccountStage.id, ownerId: admin.id,
      },
    });
  }

  // default lead stages — configurable board columns (rename/reorder/delete via /lead-stages)
  const leadStageCount = await prisma.leadStage.count();
  if (leadStageCount === 0) {
    await prisma.leadStage.createMany({
      data: [
        { name: 'New', order: 1, color: '#025ADF', isDefault: true },
        { name: 'Contacted', order: 2, color: '#0EA5E9' },
        { name: 'Qualified', order: 3, color: '#8B5CF6' },
        { name: 'Proposal Sent', order: 4, color: '#F59E0B' },
        { name: 'Negotiation', order: 5, color: '#F97316' },
        { name: 'Won', order: 6, color: '#16A34A', isWon: true },
        { name: 'Lost', order: 7, color: '#DC2626', isLost: true },
      ],
    });
  }
  const defaultStage = await prisma.leadStage.findFirstOrThrow({ where: { isDefault: true } });

  await prisma.lead.upsert({
    where: { email: 'maria@acmefoods.com' },
    update: {},
    create: {
      firstName: 'Maria', lastName: 'Johnson', email: 'maria@acmefoods.com',
      stageId: defaultStage.id, source: 'OUTREACH', ownerId: rep.id, accountId: acme.id, lastActivityAt: new Date(),
    },
  });

  console.log('Seed complete. Login admin@iprofit.com / Password123');
}

main().finally(() => prisma.$disconnect());
