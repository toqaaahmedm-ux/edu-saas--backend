const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const columns = await prisma.$queryRawUnsafe(`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE column_name = 'tenantId' AND table_schema = 'public'
    ORDER BY table_name;
  `);
  console.log('Tables with tenantId column:');
  console.log(columns);
  process.exit(0);
}
main().catch(e => { console.error('Error:', e.message); process.exit(1); });
