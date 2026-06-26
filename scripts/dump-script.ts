import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const { query } = await import('../lib/database');
  const res = await query(
    `SELECT id, topic, niche, format, status, script, slide_image_urls, slide_audio_urls, error_message, created_at
     FROM slideshow_jobs
     WHERE youtube_video_id = $1`,
    ['BlINRl_eo_E']
  );
  if (res.rows.length === 0) {
    console.log('No job found with that YouTube video ID');
    process.exit(1);
  }
  const job = res.rows[0];
  console.log('=== JOB METADATA ===');
  console.log(`ID: ${job.id}`);
  console.log(`Topic: ${job.topic}`);
  console.log(`Niche: ${job.niche}`);
  console.log(`Format: ${job.format}`);
  console.log(`Status: ${job.status}`);
  console.log(`Error: ${job.error_message || 'none'}`);
  console.log(`Created: ${job.created_at}`);
  console.log(`Slide images: ${job.slide_image_urls?.length || 0}`);
  console.log(`Slide audio: ${job.slide_audio_urls?.length || 0}`);
  console.log('\n=== SCRIPT ===');
  if (job.script?.slides) {
    job.script.slides.forEach((s: any, i: number) => {
      console.log(`\nSlide ${i + 1}:`);
      console.log(`  Text: "${s.text}"`);
      console.log(`  Words: ${s.text.split(/\s+/).length}`);
      console.log(`  Chars: ${s.text.length}`);
      console.log(`  Audio tag: ${s.audio_tag || 'none'}`);
    });
    console.log(`\nTitle: ${job.script.title}`);
    console.log(`Format: ${job.script.format}`);
  } else {
    console.log(JSON.stringify(job.script, null, 2));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
