import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { Inngest } from 'inngest';

const inngest = new Inngest({ id: 'ai-slideshow' });

async function main() {
  await inngest.send({ name: 'manual/generate', data: {} });
  console.log('Event sent: manual/generate');
}

main().catch(console.error);
