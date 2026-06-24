// Path: inngest/pipeline.ts
import { inngest } from './client';
import { query } from '@/lib/database';
import { getAccountCredentials } from '@/lib/accountService';
import { pickUnusedTopic, generateScript } from '@/lib/topicGenerator';
import { generateSlideImages } from '@/lib/imageGenerator';
import { generateSlideAudio } from '@/lib/ttsGenerator';
import { assembleVideo } from '@/lib/videoAssembler';
import { generateThumbnail } from '@/lib/thumbnailGenerator';
import { uploadVideo, uploadThumbnail } from '@/lib/cloudinary';
import { uploadToYouTube } from '@/lib/youtubeUpload';
import { ACCOUNT_ID } from '@/lib/constants';

// ─── Job state helpers ────────────────────────────────────────────────────────

async function updateJobStatus(
  jobId: string,
  status: string,
  extra?: Record<string, unknown>
) {
  const fields = ['status = $2'];
  const values: unknown[] = [jobId, status];
  let i = 3;

  if (extra) {
    for (const [key, val] of Object.entries(extra)) {
      fields.push(`${key} = $${i++}`);
      values.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
  }

  await query(
    `UPDATE slideshow_jobs SET ${fields.join(', ')} WHERE id = $1`,
    values
  );
}

async function createJob(accountId: string, topic: string): Promise<string> {
  const result = await query<{ id: string }>(
    `INSERT INTO slideshow_jobs (account_id, topic, status) VALUES ($1, $2, 'pending') RETURNING id`,
    [accountId, topic]
  );
  return result.rows[0].id;
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export const slideshowPipeline = inngest.createFunction(
  {
    id: 'slideshow-pipeline',
    retries: 2,
    concurrency: { limit: 1 }, // one video at a time — CPU bound
    triggers: [{ event: 'slideshow/generate' }],
  },
  async ({ event, step }) => {
    const accountId: string = (event.data as { accountId?: string })?.accountId ?? ACCOUNT_ID;

    // ── Step 1: Pick topic + generate script ─────────────────────────────────
    const { jobId, script } = await step.run('generate-script', async () => {
      const topic = await pickUnusedTopic();
      const s = await generateScript(topic);

      const id = await createJob(accountId, topic);
      await updateJobStatus(id, 'generating', { script: s });

      return { jobId: id, script: s };
    });

    // ── Step 2: Generate slide images (Imagen 3) ─────────────────────────────
    const slideImageUrls = await step.run('generate-images', async () => {
      const creds = await getAccountCredentials(accountId);
      const urls = await generateSlideImages(script.slides, jobId, creds);
      await updateJobStatus(jobId, 'images_done', {
        slide_image_urls: urls,
      });
      return urls;
    });

    // ── Step 3: Generate TTS audio (Gemini 2.5 Pro) ──────────────────────────
    const slideAudioUrls = await step.run('generate-tts', async () => {
      const creds = await getAccountCredentials(accountId);
      const urls = await generateSlideAudio(script.slides, jobId, creds);
      await updateJobStatus(jobId, 'tts_done', {
        slide_audio_urls: urls,
      });
      return urls;
    });

    // ── Step 4: Assemble video (FFmpeg) ──────────────────────────────────────
    const videoUrl = await step.run('assemble-video', async () => {
      const creds = await getAccountCredentials(accountId);
      const videoBuffer = await assembleVideo(slideImageUrls, slideAudioUrls, jobId);
      const url = await uploadVideo(videoBuffer, jobId, creds);
      await updateJobStatus(jobId, 'assembled', { video_url: url });
      return url;
    });

    // ── Step 5: Generate thumbnail (Imagen 3 + sharp text overlay) ───────────
    const thumbnailUrl = await step.run('gen-thumbnail', async () => {
      const creds = await getAccountCredentials(accountId);
      const thumbBuffer = await generateThumbnail(script.title, script.thumbnailPrompt);
      const url = await uploadThumbnail(thumbBuffer, jobId, creds);
      await updateJobStatus(jobId, 'assembled', { thumbnail_url: url });
      return { url, buffer: thumbBuffer };
    });

    // ── Step 6: Upload to YouTube ─────────────────────────────────────────────
    await step.run('upload-youtube', async () => {
      const creds = await getAccountCredentials(accountId);

      // Fetch thumbnail buffer again (can't pass >512KB between steps)
      const thumbRes = await fetch(thumbnailUrl.url);
      if (!thumbRes.ok) throw new Error('Failed to re-fetch thumbnail for YouTube upload');
      const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());

      const result = await uploadToYouTube(videoUrl, thumbBuffer, script, creds);

      // Persist to slideshow_uploads
      await query(
        `INSERT INTO slideshow_uploads (job_id, youtube_video_id, title, description, tags)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          jobId,
          result.youtubeVideoId,
          result.title,
          result.description,
          JSON.stringify(script.tags),
        ]
      );

      await updateJobStatus(jobId, 'uploaded', {
        youtube_video_id: result.youtubeVideoId,
      });

      console.log(
        `[Pipeline] ✅ Done: https://www.youtube.com/watch?v=${result.youtubeVideoId}`
      );

      return result;
    });
  }
);
