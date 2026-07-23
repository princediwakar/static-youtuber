import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
  const [{ query, warmup }] = await Promise.all([
    import('../lib/database'),
  ]);

  console.log('Warming up database connection...');
  await warmup();
  console.log('Connected.\n');

  // Instead of static imports that might fail, we read the ts files dynamically
  // or since it's just a seed, we can import them from the neighboring repo if possible.
  // We will dynamically import the compiled/raw data from the other repo.
  
  const UPLOADER_PATH = path.resolve(__dirname, '../../youtube-playlist-uploader/lib');
  
  // To avoid TS compilation issues with cross-repo imports, we can use tsx or just 
  // rely on the user running this with `npx tsx scripts/seed-seo-topics.ts`.
  const { batch1 } = await import(path.join(UPLOADER_PATH, 'seo-data-batch-1.ts'));
  const { batch2 } = await import(path.join(UPLOADER_PATH, 'seo-data-batch-2.ts'));
  const { batch3 } = await import(path.join(UPLOADER_PATH, 'seo-data-batch-3.ts'));

  const allBatches = [...batch1, ...batch2, ...batch3];

  let inserted = 0;
  let skipped = 0;

  const targetNiche = 'YouTube Automation';
  const accountId = 'canvas_station';

  console.log(`Seeding ${targetNiche} (${accountId}) with ${allBatches.length} topics...`);

  for (const data of allBatches) {
    try {
      // Create a combined context string for the AI from the description and seoContent
      const researchContext = `${data.description}\n\n${data.seoContent.join('\n\n')}`;
      
      const res = await query(
        `INSERT INTO slideshow_topics (topic, research_context, niche, account_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (topic, account_id) DO UPDATE
         SET research_context = EXCLUDED.research_context`,
        [data.title, researchContext, targetNiche, accountId]
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

  console.log(`\nDone. Inserted/Updated ${inserted}, skipped ${skipped} (duplicates without changes).`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
