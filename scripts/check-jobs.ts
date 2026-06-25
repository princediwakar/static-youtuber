import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const { query } = await import('../lib/database');
  const res = await query(`SELECT id, account_id, topic, status, "imageBatchName", "audioBatchName", created_at FROM slideshow_jobs ORDER BY created_at DESC LIMIT 3`);
  console.log(JSON.stringify(res.rows, null, 2));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
