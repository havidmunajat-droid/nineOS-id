import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const krama = await prisma.platform.update({
    where: { slug: 'krama' },
    data: { readinessStatus: 'ready' }
  });
  console.log('Updated:', krama.slug, krama.readinessStatus);

  const conn = await prisma.platformConnection.upsert({
    where: { platformId_environment: { platformId: krama.id, environment: 'development' } },
    update: {
      baseUrl: 'http://localhost:3001/api/v1',
      authType: 'api_key',
      apiKeyEncrypted: 'key_untuk_nineOS_baca_kpi',
      connectionStatus: 'connected',
    },
    create: {
      platformId: krama.id,
      environment: 'development',
      baseUrl: 'http://localhost:3001/api/v1',
      authType: 'api_key',
      apiKeyEncrypted: 'key_untuk_nineOS_baca_kpi',
      connectionStatus: 'connected',
    }
  });
  console.log('Connection:', conn.id, conn.connectionStatus);
  await prisma.$disconnect();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
