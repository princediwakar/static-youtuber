import { query } from './lib/database';

async function checkJobs() {
  const res = await query('SELECT id, status, youtube_video_id, error_message FROM slideshow_jobs ORDER BY created_at DESC LIMIT 5');
  console.table(res.rows);
  process.exit(0);
}

checkJobs();
