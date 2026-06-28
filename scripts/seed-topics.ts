// scripts/seed-topics.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { query } from '../lib/database';
// Ensure the path below matches where you saved the data file
import { SEEDS } from '../data/seed-data'; 

async function main() {
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