// Path: inngest/pipeline.ts
import { inngest } from './client';
import { NonRetriableError } from 'inngest';
import { generateScript, pickFormatTemplate } from '@/lib/topicGenerator';
import type { Shot } from '@/lib/types';
import { generateImage } from '@/lib/cloudflareAi';
import { generateNarrativeSpeech } from '@/lib/audioEngine';
import { selectMusicTrack } from '@/lib/musicSelector';
import {
  uploadSlideImage,
  uploadSlideAudio,
  uploadMusicTrack,
  uploadThumbnail,
  cleanupJobArtifacts
} from '@/lib/cloudinary';
import { db, query } from '@/lib/database';
import {
  CF_AI_SLIDE_WIDTH,
  CF_AI_SLIDE_HEIGHT,
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
    const skipPublish: boolean = event.data.skipPublish === true;

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

    // ── Step 2a: Generate Images per shot (batched concurrency) ────────────
    // 25 concurrent requests to Cloudflare Workers AI would trigger 429 rate
    // limiting. Sequential would waste ~160 s. Batching at 5 gives ~20 s wall
    // time without tripping Cloudflare's anomaly detection.
    const CONCURRENCY_LIMIT = 5;
    const imageUrls: string[] = new Array(script.shots.length);

    for (let batchStart = 0; batchStart < script.shots.length; batchStart += CONCURRENCY_LIMIT) {
      const batchEnd = Math.min(batchStart + CONCURRENCY_LIMIT, script.shots.length);
      const batch = script.shots.slice(batchStart, batchEnd);

      const batchResults = await Promise.all(
        batch.map((shot: Shot, offset: number) =>
          step.run(`process-shot-image-${batchStart + offset}`, async () => {
            const job = await db.getJob(jobId);
            if (job?.shot_image_urls?.[batchStart + offset]) {
              return job.shot_image_urls[batchStart + offset];
            }

            const creds = await getAccountCredentials(accountId);
            const rawImageBuffer = await generateImage(shot.visual_prompt, CF_AI_SLIDE_WIDTH, CF_AI_SLIDE_HEIGHT);
            return uploadSlideImage(rawImageBuffer, jobId, batchStart + offset, creds);
          })
        )
      );

      batchResults.forEach((url, offset) => {
        imageUrls[batchStart + offset] = url;
      });
    }

    await step.run('persist-image-urls', async () => {
      await db.updateJob(jobId, { shot_image_urls: imageUrls });
    });

    // ── Step 2b: Generate ONE continuous narration track ────────────────────
    const narrationAudioUrl = await step.run('generate-narration', async () => {
      const job = await db.getJob(jobId);
      if (job?.narration_audio_url) return job.narration_audio_url;

      const creds = await getAccountCredentials(accountId);
      const fullText = script.shots.map((s: Shot) => s.tts_text).join(' ');

      const { audioBuffer, engine } = await generateNarrativeSpeech(fullText, niche);
      console.log(`[Pipeline] Narration generated via ${engine}`);

      const url = await uploadSlideAudio(audioBuffer, jobId, 0, creds);
      await db.updateJob(jobId, { narration_audio_url: url });
      return url;
    });

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

      if (!useModal) {
        throw new Error('MODAL_RENDER_URL is not configured — cannot render video');
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);

      try {
        const response = await fetch(MODAL_RENDER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            accountId,
            shots: script.shots.map((shot: Shot, i: number) => ({
              image_url: imageUrls[i],
              text: shot.caption_text,
            })),
            audio_url: narrationAudioUrl,
            music_url: musicUrl,
            callback_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/webhooks/modal`,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          const msg = `Modal returned HTTP ${response.status}: ${errorBody.slice(0, 200)}`;
          // 400 = bad request (deterministic). 5xx = transient infra, retry.
          if (response.status >= 400 && response.status < 500) {
            throw new NonRetriableError(msg);
          }
          throw new Error(msg);
        }

        const body = await response.json();

        if (body.error) {
          throw new NonRetriableError(`Modal render failed: ${body.error}`);
        }

        if (body.videoUrl || body.mp4Url) {
          const url = body.videoUrl || body.mp4Url;
          console.log(`[Pipeline] Modal returned video: ${url}`);
          await db.updateJob(jobId, { video_url: url, status: 'assembled' });
          return url;
        }

        console.log(`[Pipeline] Modal queued render (status: ${body.status}), awaiting webhook`);
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    });

    // ── Step 4b: Wait for Modal webhook if render was sent to Modal ──────────
    let resolvedVideoUrl = videoUrl;

    if (useModal && !videoUrl) {
      const modalResult = await step.waitForEvent('wait-for-modal', {
        event: 'modal/render.complete',
        timeout: '10m',
        match: 'data.jobId',
      }).catch(() => null);

      if (modalResult?.data?.error) {
        throw new NonRetriableError(`Modal render failed asynchronously: ${modalResult.data.error}`);
      }

      if (!modalResult?.data?.mp4Url) {
        throw new Error('Modal render did not complete within 10 minutes — webhook never arrived');
      }
      resolvedVideoUrl = modalResult.data.mp4Url;
    }

    // ── Step 5: Publish ──────────────────────────────────────────────────────
    if (!skipPublish) {
      await step.run('publish', async () => {
        // Safety net: never publish from local dev, regardless of event data
        if (process.env.INNGEST_DEV === '1') {
          console.log('[Pipeline] Skipping publish — INNGEST_DEV is set (local dev)');
          return;
        }

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