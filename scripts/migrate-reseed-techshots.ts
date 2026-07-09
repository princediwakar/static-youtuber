import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  const [{ query, warmup }, { SEEDS }] = await Promise.all([
    import('../lib/database'),
    import('./seed-data'),
  ]);

  console.log('Warming up database...');
  await warmup();
  console.log('Connected.\n');

  // Delete all existing canvas_center topics
  const del = await query(`DELETE FROM slideshow_topics WHERE account_id = 'canvas_center'`);
  console.log(`Deleted ${del.rowCount} old canvas_center topics.\n`);

  // Re-seed from seed-data.ts
  let inserted = 0;
  for (const [niche, accountId, topics] of SEEDS) {
    if (accountId !== 'canvas_center') continue;
    console.log(`Seeding ${niche} (${accountId})...`);
    for (const data of topics) {
      await query(
        `INSERT INTO slideshow_topics (topic, research_context, niche, account_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (topic, account_id) DO UPDATE
         SET research_context = EXCLUDED.research_context`,
        [data.title, data.research_context, niche, accountId]
      );
      inserted++;
    }
  }

  console.log(`\nDone. Inserted/Updated ${inserted} topics for canvas_center.`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
