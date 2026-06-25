import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const { query } = await import('../lib/database');
  await query(`ALTER TABLE slideshow_jobs ADD COLUMN IF NOT EXISTS "imageBatchName" TEXT`);
  await query(`ALTER TABLE slideshow_jobs ADD COLUMN IF NOT EXISTS "audioBatchName" TEXT`);
  console.log('Columns added successfully');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
