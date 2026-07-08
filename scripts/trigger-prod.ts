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

  const args = process.argv.slice(2);
  const contentTypeIdx = args.indexOf('--contentType');
  const contentType = contentTypeIdx !== -1 ? args[contentTypeIdx + 1] : 'shorts';
  const accountIdArg = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--contentType');
  const accountId = accountIdArg || process.env.ACCOUNT_ID || 'tech_shots';
  const eventName = contentType === 'long' ? 'slideshow/trigger-long' : 'slideshow/trigger';

  console.log(`Sending ${contentType} trigger to Inngest Cloud for account: ${accountId}…`);

  const result = await inngest.send({
    name: eventName,
    data: { accountId },
  });

  console.log('✅ Trigger sent!');
  console.log('Event IDs:', result.ids);
}

triggerPipeline().catch((err) => {
  console.error('Failed to trigger pipeline:', err);
  process.exit(1);
});
