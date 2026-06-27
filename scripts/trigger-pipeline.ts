import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { Inngest } from 'inngest';

const inngest = new Inngest({ id: 'ai-slideshow' });

async function main() {
  const accountId = process.env.ACCOUNT_ID || 'tech_shots';
  await inngest.send({ name: 'slideshow/trigger', data: { accountId } });
  console.log('Event sent: slideshow/trigger for account', accountId);
}

main().catch(console.error);
