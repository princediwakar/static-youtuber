// scripts/trigger-prod.ts
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function triggerPipeline() {
  // Import Inngest, creating a fresh client that ignores INNGEST_DEV
  delete process.env.INNGEST_DEV;
  const { Inngest } = await import('inngest');

  const eventKey = process.env.INNGEST_EVENT_KEY;
  if (!eventKey) throw new Error('INNGEST_EVENT_KEY not set');

  const inngest = new Inngest({
    id: 'ai-slideshow',
    eventKey,
  });

  const accountId = process.argv[2] || process.env.ACCOUNT_ID || 'tech_shots';
  console.log(`Sending trigger to Inngest Cloud for account: ${accountId}…`);

  const result = await inngest.send({
    name: 'slideshow/trigger',
    data: { accountId },
  });

  console.log('✅ Trigger sent!');
  console.log('Event IDs:', result.ids);
}

triggerPipeline().catch((err) => {
  console.error('Failed to trigger pipeline:', err);
  process.exit(1);
});
