const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const policies = await prisma.$queryRawUnsafe(`
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY tablename;
  `);
  console.log(policies);
  process.exit(0);
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });
