// scripts/seed-topics.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  // Dynamic imports — ES module hoisting would run static imports
  // before dotenv.config(), so DATABASE_URL would be empty.
  const [{ query, warmup }, { SEEDS }] = await Promise.all([
    import('../lib/database'),
    import('./seed-data'),
  ]);

  // Wake the Neon compute before firing inserts
  console.log('Warming up database connection...');
  await warmup();
  console.log('Connected.\n');

  let inserted = 0;
  let skipped = 0;

  for (const [niche, accountId, topics] of SEEDS) {
    console.log(`Seeding ${niche} (${accountId})...`);
    for (const data of topics) {
      try {
        const res = await query(
          `INSERT INTO slideshow_topics (topic, research_context, niche, account_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (topic, account_id) DO UPDATE
           SET research_context = EXCLUDED.research_context`,
          [data.title, data.research_context, niche, accountId]
        );
        if ((res.rowCount ?? 0) > 0) {
          inserted++;
        } else {
          skipped++;
        }
      } catch (err: any) {
        console.error(`  Failed to insert: "${data.title.slice(0, 60)}..." — ${err.message}`);
      }
    }
  }

  console.log(`\nDone. Inserted/Updated ${inserted}, skipped ${skipped} (duplicates without changes).`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
