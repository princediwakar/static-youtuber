import dotenv from 'dotenv'; dotenv.config({ path: '.env.local' });
import pg from 'pg';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const res = await pool.query("SELECT * FROM slideshow_jobs WHERE id = 'c9db6eeb-3a09-49ae-9dbd-438f9d3221cf'");
  const job = res.rows[0];
  
  console.log('Script shots length:', job.script.shots.length);
  console.log('Image URLs:', job.shot_image_urls.length);
  
  const existingUrls = job.shot_image_urls || [];
  const script = job.script;
  
  if (existingUrls.length >= script.shots.length && existingUrls.slice(0, script.shots.length).every(Boolean)) {
    console.log('Images check passed!');
  } else {
    console.log('Images check FAILED!');
    console.log(existingUrls);
  }
  
  await pool.end();
}
main();
