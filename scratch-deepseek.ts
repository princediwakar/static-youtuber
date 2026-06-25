import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { generateScript } from './lib/topicGenerator';

async function main() {
  try {
    const script = await generateScript('The Pirate Republic That Had Democracy Before America');
    console.log('SUCCESS');
    console.log(JSON.stringify(script, null, 2));
  } catch (e: any) {
    console.error('FAILED:', e.message);
  }
}
main();
