// Path: inngest/pipeline.ts
import { inngest } from './client';
import { generateScript, pickFormatTemplate } from '@/lib/topicGenerator';
import { generateImage } from '@/lib/cloudflareAi';
import { generateSpeech } from '@/lib/edgeTts';
import { selectMusicTrack } from '@/lib/musicSelector';
import {
  uploadSlideImage,
  uploadSlideAudio,
  uploadMusicTrack,
  uploadVideo,
  uploadThumbnail,
  cleanupJobArtifacts
} from '@/lib/cloudinary';
import { db, query } from '@/lib/database';
import {
  CF_AI_SLIDE_WIDTH,
  CF_AI_SLIDE_HEIGHT,
  EDGE_TTS_VOICES,
  NICHE_PROFILES,
  DEFAULT_NICHE_PROFILE,
  MODAL_RENDER_URL,
  NICHES,
  ACCOUNT_NICHE,
  NICHE_PUBLISH_HOUR_UTC,
} from '@/lib/constants';
import { getAccountCredentials } from '@/lib/accountService';
import { uploadToYouTube } from '@/lib/youtubeUpload';
import { generateThumbnail } from '@/lib/thumbnailGenerator';
import { assembleVideo } from '@/lib/videoAssembler';
import { syncAnalytics, recordPublishedVideo } from '@/lib/analyticsSync';

export const generateShort = inngest.createFunction(
  {
    id: 'generate-short',
    retries: 3,
    timeouts: { finish: '2h' },
    triggers: [
      { event: 'slideshow/trigger' },
    ],
    onFailure: async ({ error, event }) => {
      console.error(`[CRITICAL] Pipeline failed: ${error.message}`);
      const accountId = (event as any)?.data?.accountId;
      const explicitJobId = (event as any)?.data?.jobId;
      try {
        const job = explicitJobId
          ? await db.getJob(explicitJobId)
          : accountId
            ? await db.getIncompleteJob(accountId)
            : null;
        if (job?.id) {
          await db.updateJob(job.id, { status: 'failed', error_message: error.message });
          console.error(`[Pipeline] Marked job ${job.id} as failed`);
        }
      } catch (dbErr: any) {
        console.error(`[CRITICAL] Failed to update job failure status: ${dbErr.message}`);
      }
    }
  },
  async ({ step, event }) => {
    const accountId: string = event.data.accountId;
    const explicitJobId: string | undefined = event.data.jobId;

    // ── Step 1: Generate Script / Resume ─────────────────────────────────────
    const { script, jobId, format_template, niche, variant, topic } = await step.run('generate-script', async () => {
      const jobToResume = explicitJobId
        ? await db.getJob(explicitJobId)
        : await db.getIncompleteJob(accountId);

      if (jobToResume) {
        console.log(`[Pipeline] Resuming job ${jobToResume.id} (status: ${jobToResume.status})`);
        if (!jobToResume.script) throw new Error(`Job ${jobToResume.id} has no script`);
        return {
          script: jobToResume.script,
          jobId: jobToResume.id,
          format_template: jobToResume.format_template,
          niche: jobToResume.niche,
          variant: jobToResume.variant ?? 'A',
          topic: jobToResume.topic,
        };
      }

      const niche = ACCOUNT_NICHE[accountId] ?? NICHES[Math.floor(Math.random() * NICHES.length)];
      const format_template = pickFormatTemplate(niche);
      const variant = Math.random() < 0.5 ? 'A' : 'B';

      const { script, topic } = await generateScript(niche, accountId);

      const jobId = await db.createJob({ account_id: accountId, topic, niche, format_template, script, status: 'script_ready', variant });
      return { script, jobId, format_template, niche, variant, topic };
    });

    // ── Step 2: Generate Images + Audio per shot (parallelized, memoized) ────
    const imageUrls: string[] = new Array(script.shots.length);
    const audioUrls: string[] = new Array(script.shots.length);

    for (let i = 0; i < script.shots.length; i++) {
      const result = await step.run(`process-shot-${i}`, async () => {
        // MEMOIZATION: If this shot was already processed in a prior run, return cached URLs
        const job = await db.getJob(jobId);
        if (job?.shot_image_urls?.[i] && job?.shot_audio_urls?.[i]) {
          return { imageUrl: job.shot_image_urls[i], audioUrl: job.shot_audio_urls[i] };
        }

        const shot = script.shots[i];
        const creds = await getAccountCredentials(accountId);
        const voice = EDGE_TTS_VOICES[niche] ?? 'en-US-AriaNeural';
        const ttsText = shot.audio_instruction
          ? `${shot.audio_instruction} ${shot.tts_text}`
          : shot.tts_text;

        // PARALLEL: Image gen and TTS share no state — run concurrently
        const [rawImageBuffer, rawAudioBuffer] = await Promise.all([
          generateImage(shot.visual_prompt, CF_AI_SLIDE_WIDTH, CF_AI_SLIDE_HEIGHT),
          generateSpeech(ttsText, voice),
        ]);

        // Raw image — captions are now rendered on Modal via ASS/FFmpeg subtitle burning
        const [imageUrl, audioUrl] = await Promise.all([
          uploadSlideImage(rawImageBuffer, jobId, i, creds),
          uploadSlideAudio(rawAudioBuffer, jobId, i, creds),
        ]);

        // Persist URLs immediately so crash recovery doesn't lose completed work
        const currentJob = await db.getJob(jobId);
        const updatedImageUrls = [...(currentJob?.shot_image_urls ?? [])];
        const updatedAudioUrls = [...(currentJob?.shot_audio_urls ?? [])];
        updatedImageUrls[i] = imageUrl;
        updatedAudioUrls[i] = audioUrl;
        await db.updateJob(jobId, {
          shot_image_urls: updatedImageUrls,
          shot_audio_urls: updatedAudioUrls,
        });

        return { imageUrl, audioUrl };
      });

      imageUrls[i] = result.imageUrl;
      audioUrls[i] = result.audioUrl;
    }

    await step.run('update-assets-ready', async () => {
      await db.updateJob(jobId, { status: 'assets_ready' });
    });

    // ── Step 3: Select Background Music ──────────────────────────────────────
    const musicUrl = await step.run('select-music', async () => {
      const job = await db.getJob(jobId);
      if (job?.music_url) return job.music_url;

      const creds = await getAccountCredentials(accountId);
      const { buffer, filename } = await selectMusicTrack(script.title, niche, script.visual_world);
      const url = await uploadMusicTrack(buffer, jobId, creds);
      await db.updateJob(jobId, { music_url: url });
      return url;
    });

    // ── Step 4: Generate thumbnail & Render ──────────────────────────────────
    const useModal = MODAL_RENDER_URL && !MODAL_RENDER_URL.includes('example-modal-url');

    const videoUrl = await step.run('render-video', async () => {
      const job = await db.getJob(jobId);
      if (job?.video_url) return job.video_url;

      const creds = await getAccountCredentials(accountId);

      const thumbBuffer = await generateThumbnail(script.title, script.thumbnailPrompt, niche);
      const thumbnailUrl = await uploadThumbnail(thumbBuffer, jobId, creds);
      await db.updateJob(jobId, { thumbnail_url: thumbnailUrl });

      if (useModal) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90_000);

        try {
          const response = await fetch(MODAL_RENDER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jobId,
              shots: (script.shots as Array<{ caption_text: string }>).map((shot, i) => ({
                image_url: imageUrls[i],
                audio_url: audioUrls[i],
                caption_text: shot.caption_text,
              })),
              music_url: musicUrl,
              callback_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/webhooks/modal`,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (response.ok) {
            const body = await response.json();
            if (body.mp4Url) {
              console.log(`[Pipeline] Modal returned video: ${body.mp4Url}`);
              return body.mp4Url;
            }
            console.log(`[Pipeline] Modal queued render (async), awaiting webhook callback`);
          } else {
            console.warn(`[Pipeline] Modal returned ${response.status}, falling back to local assembler`);
          }
        } catch (e: any) {
          clearTimeout(timeout);
          if (e.name === 'AbortError') {
            console.warn('[Pipeline] Modal timed out after 90s — will await webhook');
          } else {
            console.warn(`[Pipeline] Modal unreachable: ${e}, will await webhook`);
          }
        }
      }

      const videoBuffer = await assembleVideo(imageUrls, audioUrls, musicUrl, jobId);
      return uploadVideo(videoBuffer, jobId, creds);
    });

    // ── Step 4b: Wait for Modal webhook if render was sent to Modal ──────────
    let resolvedVideoUrl = videoUrl;

    if (useModal && !videoUrl) {
      const modalResult = await step.waitForEvent('wait-for-modal', {
        event: 'modal/render.complete',
        timeout: '10m',
        match: 'data.jobId',
      }).catch(() => null);

      resolvedVideoUrl = modalResult?.data?.mp4Url;
      if (!resolvedVideoUrl) {
        console.warn(`[Pipeline] Modal webhook never arrived, falling back to local assembler`);
        const videoBuffer = await assembleVideo(imageUrls, audioUrls, musicUrl, jobId);
        const creds = await getAccountCredentials(accountId);
        resolvedVideoUrl = await uploadVideo(videoBuffer, jobId, creds);
      }
    }

    // ── Step 5: Publish ──────────────────────────────────────────────────────
    await step.run('publish', async () => {
      const job = await db.getJob(jobId);
      if (job?.status === 'published') return;

      const creds = await getAccountCredentials(accountId);

      const jobRecord = await query('SELECT thumbnail_url FROM slideshow_jobs WHERE id = $1', [jobId]);

      let thumbRes;
      for (let t = 0; t < 3; t++) {
        thumbRes = await fetch(jobRecord.rows[0].thumbnail_url);
        if (thumbRes.ok) break;
        await new Promise(res => setTimeout(res, 1000));
      }

      if (!thumbRes || !thumbRes.ok) throw new Error('Failed to fetch thumbnail for YouTube upload after retries');

      const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
      const result = await uploadToYouTube(resolvedVideoUrl, thumbBuffer, script, creds);

      await query(
        `INSERT INTO slideshow_uploads (job_id, youtube_video_id, title, description, tags, variant)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, result.youtubeVideoId, result.title, result.description, JSON.stringify(script.tags), variant]
      );

      const topicRes = await query<{ id: number }>(
        'SELECT id FROM slideshow_topics WHERE topic = $1 AND account_id = $2',
        [topic, accountId]
      );
      if (topicRes.rows.length > 0) {
        const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
        await recordPublishedVideo({
          topicId: topicRes.rows[0].id,
          youtubeId: result.youtubeVideoId,
          aestheticId: profile.aestheticId,
          format: format_template,
          qualityScore: 7,
        });
      }

      await db.updateJob(jobId, { status: 'published', video_url: resolvedVideoUrl, youtube_video_id: result.youtubeVideoId });
      await cleanupJobArtifacts(jobId, creds);
    });
  }
);

// ── Channel Scheduler ──────────────────────────────────────────────────────────
// Each niche fires at its optimal UTC hour (staggered across the US daytime
// window). The cron runs at all 4 hours; on each tick, only the niche whose
// publish hour matches the current hour gets triggered.
//
//   Financial Forensics → 15:00 UTC (11 AM EST)
//   Stoic Philosophy    → 17:00 UTC ( 1 PM EST)
//   Urban Survival      → 19:00 UTC ( 3 PM EST)
//   SaaS & AI Tools     → 21:00 UTC ( 5 PM EST)
export const channelScheduler = inngest.createFunction(
  {
    id: 'channel-scheduler',
    retries: 1,
    triggers: [
      { cron: '0 15 * * *' },
      { cron: '0 17 * * *' },
      { cron: '0 19 * * *' },
      { cron: '0 21 * * *' },
    ],
    onFailure: async ({ error }) => {
      console.error(`[CRITICAL] Channel scheduler failed: ${error.message}`);
    },
  },
  async ({ step }) => {
    const currentHour = new Date().getUTCHours();

    const channels = await step.run('get-channels', async () => {
      const result = await query<{ id: string }>(
        "SELECT id FROM accounts WHERE status = 'active'"
      );
      return result.rows.map(r => ({ account_id: r.id, niche: ACCOUNT_NICHE[r.id] }));
    });

    const dueChannels = channels.filter(c => NICHE_PUBLISH_HOUR_UTC[c.niche] === currentHour);

    if (dueChannels.length === 0) {
      console.log(`[Scheduler] No channels scheduled for ${currentHour}:00 UTC`);
      return { accountsTriggered: 0, accountsSkipped: channels.length };
    }

    let triggered = 0;
    let skipped = 0;

    for (const channel of dueChannels) {
      const shouldRun = await step.run(`check-throttle-${channel.account_id}`, async () => {
        const recent = await query<{ id: string }>(
          `SELECT id FROM slideshow_jobs
           WHERE account_id = $1
             AND status = 'published'
             AND created_at > NOW() - INTERVAL '24 hours'
           LIMIT 1`,
          [channel.account_id]
        );
        return recent.rows.length === 0;
      });

      if (shouldRun) {
        await step.sendEvent(`trigger-${channel.account_id}`, {
          name: 'slideshow/trigger',
          data: { accountId: channel.account_id },
        });
        triggered++;
      } else {
        console.log(`[Scheduler] Skipping ${channel.account_id} — already published within 24h`);
        skipped++;
      }
    }

    const notDue = channels.filter(c => NICHE_PUBLISH_HOUR_UTC[c.niche] !== currentHour);
    for (const c of notDue) {
      console.log(`[Scheduler] ${c.account_id} (${c.niche}) scheduled for ${NICHE_PUBLISH_HOUR_UTC[c.niche]}:00 UTC, skipping at ${currentHour}:00`);
    }

    return { accountsTriggered: triggered, accountsSkipped: skipped + notDue.length };
  }
);

// ── Analytics Sync ─────────────────────────────────────────────────────────────
export const syncAnalyticsCron = inngest.createFunction(
  {
    id: 'sync-analytics',
    retries: 2,
    triggers: [{ cron: '0 5 * * *' }],
    onFailure: async ({ error }) => {
      console.error(`[CRITICAL] Analytics sync failed: ${error.message}`);
    },
  },
  async () => {
    await syncAnalytics();
  }
);
