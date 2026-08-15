const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const bad = await prisma.question.findMany({ where: { correctIndex: null } });
  console.log('Found questions with NULL correctIndex:', JSON.stringify(bad, null, 2));
  await prisma.$disconnect();
})();
