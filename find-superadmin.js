const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, name: true, email: true, tenantId: true },
  });
  console.log(JSON.stringify(admins, null, 2));
  await prisma.$disconnect();
})();
