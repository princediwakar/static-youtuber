import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const { query } = await import('../lib/database');
  const res = await query(
    `SELECT id, topic, niche, format_template, status, script, shot_image_urls, shot_audio_urls, error_message, created_at
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
  console.log(`Format: ${job.format_template}`);
  console.log(`Status: ${job.status}`);
  console.log(`Error: ${job.error_message || 'none'}`);
  console.log(`Created: ${job.created_at}`);
  console.log(`Shot images: ${job.shot_image_urls?.length || 0}`);
  console.log(`Shot audio: ${job.shot_audio_urls?.length || 0}`);
  console.log('\n=== SCRIPT ===');
  if (job.script?.shots) {
    job.script.shots.forEach((s: any, i: number) => {
      console.log(`\nShot ${i + 1}:`);
      console.log(`  TTS Text: "${s.tts_text}"`);
      console.log(`  Words: ${s.tts_text.split(/\s+/).length}`);
      console.log(`  Chars: ${s.tts_text.length}`);
      console.log(`  Audio instruction: ${s.audio_instruction || 'none'}`);
    });
    console.log(`\nTitle: ${job.script.title}`);
    console.log(`Format template: ${job.script.format_template}`);
  } else {
    console.log(JSON.stringify(job.script, null, 2));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
