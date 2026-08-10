const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const fakeUser = await prisma.user.findFirst({ where: { email: 'fake@qa-test-academy.com' } });
  console.log('Fake owner exists:', fakeUser ? 'YES (BUG!)' : 'NO (correct)');
  const fakeTenant = await prisma.tenant.findFirst({ where: { name: 'Another Academy' } });
  console.log('Fake tenant exists:', fakeTenant ? 'YES (BUG!)' : 'NO (correct)');
  await prisma.$disconnect();
})();
