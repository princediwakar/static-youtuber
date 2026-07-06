// inngest/pipeline.ts
import { inngest } from './client';
import { NonRetriableError } from 'inngest';
import { generateScript, pickFormatTemplate } from '@/lib/topicGenerator';
import type { Shot } from '@/lib/types';
import { generateImage } from '@/lib/cloudflareAi';
import { generateShotSpeech } from '@/lib/audioEngine';
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
  ACE_STEP_WARMUP_URL,
  getCaptionStyle,
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

    // ── Step 1: Parallelize Script Generation & GPU Warmup ───────────────────
    const [scriptResult] = await Promise.all([
      step.run('generate-script', async () => {
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
        (event as any).data.jobId = jobId;
        return { script, jobId, format_template, niche, variant, topic };
      }),

      step.run('warmup-bgm-gpu', async () => {
        if (!ACE_STEP_WARMUP_URL) return { status: 'skipped' };
        
        try {
          const res = await fetch(ACE_STEP_WARMUP_URL, { method: 'GET' });
          if (!res.ok) console.warn(`[Pipeline] BGM Warmup failed with status: ${res.status}`);
          return { status: 'warmed' };
        } catch (err) {
          console.warn(`[Pipeline] BGM Warmup network/URL error:`, err);
          return { status: 'failed' }; 
        }
      })
    ]);

    const { script, jobId, format_template, niche, variant, topic } = scriptResult;

    // ── Step 2a: Generate Narration (per-shot, parallel, to eliminate F5-TTS hallucination bleed) ──
    const { shotAudioUrls, narrationDurationMs } = await step.run('generate-narration', async () => {
      const job = await db.getJob(jobId);
      if (job?.shot_audio_urls) return { shotAudioUrls: job.shot_audio_urls, narrationDurationMs: 0 };

      const creds = await getAccountCredentials(accountId);
      const CONCURRENCY_LIMIT = 5;

      const results: { audioBuffer: Buffer; durationMs: number }[] = [];

      for (let batchStart = 0; batchStart < script.shots.length; batchStart += CONCURRENCY_LIMIT) {
        const batchEnd = Math.min(batchStart + CONCURRENCY_LIMIT, script.shots.length);
        const batch = script.shots.slice(batchStart, batchEnd);

        const batchResults = await Promise.all(
          batch.map((shot: Shot, offset: number) => {
            const globalIndex = batchStart + offset;
            const rawText = shot.spoken_text;
            const sanitized = rawText
              .replace(/[‘’`]/g, "'")
              .replace(/[“”]/g, '"')
              .replace(/—/g, '... ')
              .replace(/[^\x00-\x7F]/g, '');
            return generateShotSpeech(sanitized, script.voiceName, globalIndex);
          })
        );

        batchResults.forEach((r) => results.push(r));
      }

      const urls: string[] = [];
      for (let i = 0; i < results.length; i++) {
        const url = await uploadSlideAudio(results[i].audioBuffer, jobId, i, creds);
        urls.push(url);
      }

      const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
      await db.updateJob(jobId, { shot_audio_urls: urls });
      return { shotAudioUrls: urls, narrationDurationMs: totalDurationMs };
    });

    const narrationDurationSec = Math.ceil(narrationDurationMs / 1000) || 60;

    // ── Step 2b: Parallel Remaining Assets (Images, BGM, Thumbnail) ────────────
    const [imageUrls, musicUrl] = await Promise.all([
      
      // Task A: Generate All Images (with internal idempotency)
      step.run('generate-all-images', async () => {
        const job = await db.getJob(jobId);
        const existingUrls = job?.shot_image_urls || [];
        const urls: string[] = [...existingUrls];

        // Fast-path: Return early if all images are already generated
        if (urls.length >= script.shots.length && urls.slice(0, script.shots.length).every(Boolean)) {
          return urls.slice(0, script.shots.length);
        }

        const creds = await getAccountCredentials(accountId);
        const CONCURRENCY_LIMIT = 5;

        for (let batchStart = 0; batchStart < script.shots.length; batchStart += CONCURRENCY_LIMIT) {
          const batchEnd = Math.min(batchStart + CONCURRENCY_LIMIT, script.shots.length);
          const batch = script.shots.slice(batchStart, batchEnd);

          const batchResults = await Promise.all(
            batch.map(async (shot: Shot, offset: number) => {
              const globalIndex = batchStart + offset;
              
              // Granular bypass if this specific image was already done
              if (urls[globalIndex]) return urls[globalIndex];

              const rawImageBuffer = await generateImage(shot.visual_prompt, CF_AI_SLIDE_WIDTH, CF_AI_SLIDE_HEIGHT);
              return uploadSlideImage(rawImageBuffer, jobId, globalIndex, creds);
            })
          );

          batchResults.forEach((url, offset) => {
            urls[batchStart + offset] = url;
          });

          // Partial commit to DB. If the next batch fails, we don't lose these.
          await db.updateJob(jobId, { shot_image_urls: urls });
        }

        return urls;
      }),

      // Task B: Select Background Music
      step.run('select-music', async () => {
        const job = await db.getJob(jobId);
        if (job?.music_url) return job.music_url;

        const creds = await getAccountCredentials(accountId);
        const narrationText = script.shots.map((s: Shot) => s.spoken_text).join(' ');
        const { buffer } = await selectMusicTrack(script.title, niche, format_template, script.visual_world, narrationText, narrationDurationSec);
        const url = await uploadMusicTrack(buffer, jobId, creds);
        
        await db.updateJob(jobId, { music_url: url });
        return url;
      }),

      // Task C: Generate Thumbnail
      step.run('generate-thumbnail', async () => {
        const job = await db.getJob(jobId);
        if (job?.thumbnail_url) return job.thumbnail_url;

        const creds = await getAccountCredentials(accountId);
        const thumbBuffer = await generateThumbnail(script.title, script.thumbnailPrompt, niche);
        const url = await uploadThumbnail(thumbBuffer, jobId, creds);
        
        await db.updateJob(jobId, { thumbnail_url: url });
        return url;
      })
    ]);

    // Mark assets as fully ready once the entire Promise.all resolves
    await step.run('update-assets-ready', async () => {
      await db.updateJob(jobId, { status: 'assets_ready' });
    });

    // ── Step 3: Render ───────────────────────────────────────────────────────
    const useModal = MODAL_RENDER_URL && !MODAL_RENDER_URL.includes('example-modal-url');

    const videoUrl = await step.run('render-video', async () => {
      const job = await db.getJob(jobId);
      if (job?.video_url) return job.video_url;

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
            // NEW: which visual world this job belongs to, plus the resolved
            // font/color style for it. Your Modal render script (not part of
            // this change — it wasn't shared) will need to actually read
            // caption_style.fontFile / textColor / strokeColor and apply them
            // in its ffmpeg drawtext filter for captions to pick up the new
            // per-niche typography. Until that's wired up, adding these
            // fields here is inert — the render service will just ignore
            // keys it doesn't recognize.
            visual_world: script.visual_world,
            caption_style: getCaptionStyle(script.visual_world),
            shots: script.shots.map((shot: Shot, i: number) => ({
              image_url: imageUrls[i],
              caption_text: shot.caption_text,
              spoken_text: shot.spoken_text,
              audio_url: shotAudioUrls[i],
            })),
            shot_audio_urls: shotAudioUrls,
            music_url: musicUrl,
            callback_url: `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/webhooks/modal`,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          const msg = `Modal returned HTTP ${response.status}: ${errorBody.slice(0, 200)}`;
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

    // ── Step 3b: Wait for Modal webhook if render was sent to Modal ──────────
    let resolvedVideoUrl = videoUrl;

    if (useModal && !videoUrl) {
      const modalResult = await step.waitForEvent('wait-for-modal', {
        event: 'modal/render.complete',
        timeout: '10m',
        if: `async.data.jobId == '${jobId}'`,
      }).catch(() => null);

      if (modalResult?.data?.error) {
        throw new NonRetriableError(`Modal render failed asynchronously: ${modalResult.data.error}`);
      }

      if (!modalResult?.data?.mp4Url) {
        throw new Error('Modal render did not complete within 10 minutes — webhook never arrived');
      }
      resolvedVideoUrl = modalResult.data.mp4Url;
    }

    // ── Step 4: Publish ──────────────────────────────────────────────────────
    if (!skipPublish) {
      await step.run('publish', async () => {
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
      });
    }
  }
);

// Note: channelScheduler and syncAnalyticsCron remain completely unchanged below.
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