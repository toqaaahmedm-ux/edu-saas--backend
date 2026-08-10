const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log(JSON.stringify(logs, null, 2));
  await prisma.$disconnect();
})();
