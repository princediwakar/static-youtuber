import 'dotenv/config';
import { query } from '../lib/database';

async function main() {
  const res = await query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'slideshow_jobs'
  `);
  console.log(JSON.stringify(res.rows, null, 2));
}
main().catch(console.error).finally(() => process.exit(0));
