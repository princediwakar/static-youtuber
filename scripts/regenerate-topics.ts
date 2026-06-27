import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import { generateTopics } from '../lib/topicGenerator';

const PAIRS: [string, string][] = [
  ['SaaS & AI Tools', 'tech_shots'],
  ['Financial Forensics', 'finance_shots'],
  ['Stoic Philosophy', 'stoic_shots'],
  ['Urban Survival', 'survival_shots'],
];

async function main() {
  for (const [niche, accountId] of PAIRS) {
    console.log(`Generating topics for ${niche} (${accountId})...`);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await generateTopics(niche, accountId);
        console.log(`  Done.`);
        break;
      } catch (err: any) {
        if (attempt < 4 && (err?.status === 503 || err?.message?.includes('503') || err?.message?.includes('UNAVAILABLE'))) {
          const wait = 5000 * (attempt + 1);
          console.log(`  503 — retrying in ${wait / 1000}s...`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        throw err;
      }
    }
  }
  console.log('\nAll 4 niches regenerated.');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
