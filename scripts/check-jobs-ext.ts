import dotenv from 'dotenv';
import path from 'path';
import pg from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const res = await pool.query('SELECT id, account_id, topic, status, error_message, youtube_video_id FROM slideshow_jobs ORDER BY created_at DESC LIMIT 5');
  console.log(JSON.stringify(res.rows, null, 2));
  await pool.end();
}

main().catch(console.error);
