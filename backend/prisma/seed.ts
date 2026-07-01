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
            { name: 'Appointment Scheduled', order: 1, winProbability: 20 },
            { name: 'Qualified To Buy', order: 2, winProbability: 40 },
            { name: 'Presentation Scheduled', order: 3, winProbability: 60 },
            { name: 'Decision Maker Bought-In', order: 4, winProbability: 80 },
            { name: 'Contract Sent', order: 5, winProbability: 90 },
            { name: 'Closed Won', order: 6, winProbability: 100, isClosedWon: true },
            { name: 'Closed Lost', order: 7, winProbability: 0, isClosedLost: true },
          ],
        },
      },
    });
  }

  let acme = await prisma.account.findFirst({ where: { domain: 'acmefoods.com' } });
  if (!acme) {
    acme = await prisma.account.create({
      data: { name: 'Acme Foods', domain: 'acmefoods.com', industry: 'Food & Beverage', ownerId: admin.id },
    });
  }

  await prisma.lead.upsert({
    where: { email: 'maria@acmefoods.com' },
    update: {},
    create: {
      firstName: 'Maria', lastName: 'Johnson', email: 'maria@acmefoods.com',
      status: 'NEW', source: 'MANUAL', ownerId: rep.id, accountId: acme.id, lastActivityAt: new Date(),
    },
  });

  console.log('Seed complete. Login admin@iprofit.com / Password123');
}

main().finally(() => prisma.$disconnect());
