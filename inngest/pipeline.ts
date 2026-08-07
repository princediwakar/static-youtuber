// inngest/pipeline.ts
import { inngest } from './client';
import { NonRetriableError } from 'inngest';
import { generateScript, generateLongFormScript } from '@/lib/generators';
import type { Shot } from '@/lib/types';
import type { FormatTemplate } from '@/lib/constants';
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
  LONG_CF_AI_SLIDE_WIDTH,
  LONG_CF_AI_SLIDE_HEIGHT,
  LONG_THUMBNAIL_WIDTH,
  LONG_THUMBNAIL_HEIGHT,
  NICHE_PROFILES,
  DEFAULT_NICHE_PROFILE,
  NICHES,
  ACCOUNT_NICHE,
  getModalRenderUrl,
  getCaptionStyle,
} from '@/lib/constants';
import { getAccountCredentials } from '@/lib/accountService';
import { uploadToYouTube } from '@/lib/youtubeUpload';
import { generateThumbnail } from '@/lib/thumbnailGenerator';
import { syncAnalytics, recordPublishedVideo } from '@/lib/analyticsSync';

// --- HELPER FUNCTION: ASSET PIPELINE ---
async function executeAssetPipeline(
  step: any,
  accountId: string,
  jobId: string,
  script: any,
  format_template: string,
  niche: string,
  topic: string,
  skipPublish: boolean,
  isLongForm: boolean,
  variant: string | null = null
) {
  // ── Step 2: All Assets Parallel (Narration, Images, Music, Thumbnail) ────────
  // Calculate estimated duration (word count / 2.5 words per sec + 10s buffer)
  const totalWords = script.shots.reduce((acc: number, s: Shot) => acc + s.spoken_text.split(/\s+/).length, 0);
  const estimatedDurationSec = Math.ceil(totalWords / 2.5) + 10;
  
  // Settings based on content type
  const slideWidth = isLongForm ? LONG_CF_AI_SLIDE_WIDTH : CF_AI_SLIDE_WIDTH;
  const slideHeight = isLongForm ? LONG_CF_AI_SLIDE_HEIGHT : CF_AI_SLIDE_HEIGHT;
  const musicDurationLimit = isLongForm ? 300 : 60;
  const renderTimeout = '30m';

  // ── Step 2: Parallel Asset Generation (Narration, Images, Thumbnail) ────────
  const [
    { audioUrl, narrationDurationMs },
    imageUrls,
    thumbnailUrl
  ] = await Promise.all([
    
    // Task A: Generate Narration
    // Task A: Generate Narration
    (async () => {
      let audioUrl = '';
      let durationMs = 0;
      const jobA = await step.run('check-narration-resume', () => db.getJob(jobId));
      if (jobA?.narration_audio_url) {
        audioUrl = jobA.narration_audio_url;
      } else {
        const fullNarrative = script.shots.map((s: Shot) => {
          let text = s.spoken_text.trim();
          if (!/[.!?]$/.test(text)) {
            text += '.';
          }
          return text;
        }).join(' ');
        const creds = await getAccountCredentials(accountId);
        const res = await step.run('generate-audio-narrative', async () => {
          const sanitized = fullNarrative
            .replace(/[‘’`]/g, "'")
            .replace(/[“”]/g, '"')
            .replace(/[\u2014—]/g, '... ')
            .replace(/[^\x00-\x7F]/g, '');
          const result = await generateNarrativeSpeech(sanitized, script.voiceName);
          const url = await uploadSlideAudio(result.audioBuffer, jobId, 'full', creds);
          return { url, durationMs: result.durationMs };
        });
        audioUrl = res.url;
        durationMs = res.durationMs;
        await step.run('save-narration', () => db.updateJob(jobId, { narration_audio_url: audioUrl }));
      }
      return { shotAudioUrls: [], audioUrl, narrationDurationMs: durationMs };
    })(),

    // Task B: Generate Images
    (async () => {
      const job = await step.run('check-images-resume', () => db.getJob(jobId));
      const existingUrls = job?.shot_image_urls || [];
      const urls: string[] = [...existingUrls];

      if (urls.length >= script.shots.length && urls.slice(0, script.shots.length).every(Boolean)) {
        return urls.slice(0, script.shots.length);
      }

      const CONCURRENCY_LIMIT = 2;

      for (let batchStart = 0; batchStart < script.shots.length; batchStart += CONCURRENCY_LIMIT) {
        const batchUrls = await step.run(`generate-images-batch-${batchStart}`, async () => {
          const creds = await getAccountCredentials(accountId);
          const batchEnd = Math.min(batchStart + CONCURRENCY_LIMIT, script.shots.length);
          const batch = script.shots.slice(batchStart, batchEnd);

          return Promise.all(
            batch.map(async (shot: Shot, offset: number) => {
              const globalIndex = batchStart + offset;
              if (urls[globalIndex]) return urls[globalIndex];
              const rawImageBuffer = await generateImage(shot.visual_prompt, slideWidth, slideHeight);
              return uploadSlideImage(rawImageBuffer, jobId, globalIndex, creds);
            })
          );
        });
        batchUrls.forEach((url: string, offset: number) => { urls[batchStart + offset] = url; });
        await step.run(`save-images-batch-${batchStart}`, () => db.updateJob(jobId, { shot_image_urls: urls }));
      }

      return urls;
    })(),

    // Task D: Generate Thumbnail
    step.run('generate-thumbnail', async () => {
      const job = await db.getJob(jobId);
      if (job?.thumbnail_url) return job.thumbnail_url;

      const creds = await getAccountCredentials(accountId);
      const thumbText = script.hook_intro
        ? `${script.hook_intro.slice(0, 40)} — ${script.title}`
        : script.title;
        
      const thumbBuffer = isLongForm 
        ? await generateThumbnail(thumbText, script.thumbnailPrompt, niche, LONG_THUMBNAIL_WIDTH, LONG_THUMBNAIL_HEIGHT)
        : await generateThumbnail(thumbText, script.thumbnailPrompt, niche);
        
      const url = await uploadThumbnail(thumbBuffer, jobId, creds);
      await db.updateJob(jobId, { thumbnail_url: url });
      return url;
    })
  ]);

  const narrationDurationSec = narrationDurationMs > 0 
    ? Math.ceil(narrationDurationMs / 1000) 
    : estimatedDurationSec;

  // Task C: Select Background Music
  const musicUrl = await step.run('select-music', async () => {
    const job = await db.getJob(jobId);
    if (job?.music_url) return job.music_url;

    const creds = await getAccountCredentials(accountId);
    const duration = Math.min(narrationDurationSec, musicDurationLimit);
    const narrationText = script.shots.map((s: Shot) => s.spoken_text).join(' ');
    
    const { buffer } = await selectMusicTrack(
      script.title, 
      niche, 
      format_template as FormatTemplate, 
      script.visual_world,
      narrationText,
      duration
    );
    
    const url = await uploadMusicTrack(buffer, jobId, creds);
    await db.updateJob(jobId, { music_url: url });
    return url;
  });

  await step.run('update-assets-ready', async () => {
    await db.updateJob(jobId, { status: 'assets_ready' });
  });

  // ── Step 3: Render ───────────────────────────────────────────────────────
  const modalRenderUrl = getModalRenderUrl();
  const useModal = modalRenderUrl && !modalRenderUrl.includes('example-modal-url');

  const videoUrl = await step.run('render-video', async () => {
    const job = await db.getJob(jobId);
    if (job?.video_url) return job.video_url;
    if (!useModal) throw new Error('MODAL_RENDER_URL is not configured');

    const isLocalDev = process.env.INNGEST_DEV === '1' || process.env.NODE_ENV === 'development';
    const controller = new AbortController();
    const timeoutDuration = isLocalDev ? 600_000 : 30_000;
    const timeout = setTimeout(() => controller.abort(), timeoutDuration);

    try {
        const callbackUrl = new URL('/api/webhooks/modal', process.env.NEXTAUTH_URL || 'http://localhost:3000');
        callbackUrl.searchParams.set('accountId', accountId);
        callbackUrl.searchParams.set('skipPublish', String(skipPublish));

        const response = await fetch(modalRenderUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId,
            accountId,
            content_type: isLongForm ? 'long' : 'shorts',
            visual_world: script.visual_world,
            caption_style: getCaptionStyle(script.visual_world),
            shots: script.shots.map((shot: Shot, i: number) => ({
              image_url: imageUrls[i],
              caption_text: shot.caption_text,
              spoken_text: shot.spoken_text,
            })),
            audio_url: audioUrl,
            music_url: musicUrl,
            callback_url: callbackUrl.toString(),
            sync: isLocalDev,
            cloudinary_credentials: {
              cloud_name: (await getAccountCredentials(accountId)).cloudinaryCloudName,
              api_key: (await getAccountCredentials(accountId)).cloudinaryApiKey,
              api_secret: (await getAccountCredentials(accountId)).cloudinaryApiSecret,
            }
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text().catch(() => '');
          const msg = `Modal returned HTTP ${response.status}: ${errorBody.slice(0, 200)}`;
          if (response.status >= 400 && response.status < 500) throw new NonRetriableError(msg);
          throw new Error(msg);
        }

        const body = await response.json();
        if (body.error) throw new NonRetriableError(`Modal render failed: ${body.error}`);

        if (body.videoUrl || body.mp4Url) {
          const url = body.videoUrl || body.mp4Url;
          console.log(`[Pipeline] Modal returned video immediately: ${url}`);
          await db.updateJob(jobId, { video_url: url, status: 'assembled' });
          return url;
        }

        console.log(`[Pipeline] Modal queued render, awaiting webhook`);
      } catch (e: any) {
        clearTimeout(timeout);
        throw e;
      }
    });

  // When Modal returns the video URL synchronously (within the fetch timeout window)
  // the webhook callback is never fired, so we must send the publish event here.
  // For async renders, the webhook at /api/webhooks/modal handles this instead.
  if (videoUrl && !skipPublish) {
    await step.sendEvent('trigger-publish', {
      name: 'slideshow/publish',
      data: { jobId, accountId },
    });
    console.log(`[Pipeline] Sync Modal render — triggered publish for job ${jobId}`);
  }

}

export const publishVideo = inngest.createFunction(
  {
    id: 'publish-video',
    retries: 1,
    timeouts: { finish: '30m' },
    triggers: [{ event: 'slideshow/publish' }],
    onFailure: async ({ error, event }) => {
      console.error(`[CRITICAL] Publish failed: ${error.message}`);
      const explicitJobId = (event as any)?.data?.jobId;
      const accountId = (event as any)?.data?.accountId;
      if (explicitJobId) {
        try {
          await db.updateJob(explicitJobId, { status: 'failed', error_message: `Publish failed: ${error.message}` });
          if (accountId) {
            const creds = await getAccountCredentials(accountId);
            await cleanupJobArtifacts(explicitJobId, creds);
          }
        } catch (dbErr: any) {
          console.error(`[CRITICAL] Failed to update job failure status or cleanup: ${dbErr.message}`);
        }
      }
    }
  },
  async ({ step, event }) => {
    const accountId: string = event.data.accountId;
    const jobId: string = event.data.jobId;

    if (process.env.INNGEST_DEV === '1') {
      console.log('[Pipeline] Skipping publish — INNGEST_DEV is set');
      return;
    }

    const job = await db.getJob(jobId);
    if (!job) throw new NonRetriableError(`Job not found: ${jobId}`);
    if (job.status === 'published') {
      console.log(`[Pipeline] Job ${jobId} is already published, skipping.`);
      return;
    }
    if (job.status !== 'assembled' || !job.video_url) {
      throw new Error(`Job ${jobId} is not assembled yet or missing video_url. Current status: ${job.status}`);
    }

    await step.run('publish', async () => {
      const creds = await getAccountCredentials(accountId);
      
      let thumbRes;
      for (let t = 0; t < 3; t++) {
        thumbRes = await fetch(job.thumbnail_url);
        if (thumbRes.ok) break;
        await new Promise(res => setTimeout(res, 1000));
      }
      if (!thumbRes?.ok) throw new Error('Failed to fetch thumbnail for YouTube upload after retries');

      const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
      const labelAsSynthetic = Math.random() < 0.5;
      
      const script = typeof job.script === 'string' ? JSON.parse(job.script) : job.script;
      
      const result = await uploadToYouTube(job.video_url, thumbBuffer, script, creds, labelAsSynthetic);

      await query(
        `INSERT INTO slideshow_uploads (job_id, youtube_video_id, title, description, tags, variant)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, result.youtubeVideoId, result.title, result.description, JSON.stringify(script.tags), job.variant]
      );

      const topicRes = await query<{ id: number }>(
        'SELECT id FROM slideshow_topics WHERE topic = $1 AND account_id = $2',
        [job.topic, accountId]
      );
      if (topicRes.rows.length > 0) {
        const profile = NICHE_PROFILES[job.niche] ?? DEFAULT_NICHE_PROFILE;
        await recordPublishedVideo({
          topicId: topicRes.rows[0].id,
          youtubeId: result.youtubeVideoId,
          aestheticId: profile.aestheticId,
          format: job.format_template,
          qualityScore: 7,
        });
      }

      await db.updateJob(jobId, { status: 'published', youtube_video_id: result.youtubeVideoId });
      
      // Clean up intermediate assets after successful publish to save Cloudinary storage
      await cleanupJobArtifacts(jobId, creds);
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PIPELINES & SCHEDULERS
// ─────────────────────────────────────────────────────────────────────────────

export const generateShort = inngest.createFunction(
  {
    id: 'generate-short',
    retries: 1,
    timeouts: { finish: '20m' },
    concurrency: { key: 'event.data.accountId', limit: 1 },
    triggers: [{ event: 'slideshow/trigger' }],
    onFailure: async ({ error, event }) => {
      console.error(`[CRITICAL] Pipeline failed: ${error.message}`);
      const accountId = (event as any)?.data?.accountId;
      const explicitJobId = (event as any)?.data?.jobId;
      try {
        // If we have an explicit jobId (from manual triggers), use it directly.
        // Otherwise, query for the most recent pending job for this account to
        // avoid races when multiple runs exist concurrently for the same account.
        let job;
        if (explicitJobId) {
          job = await db.getJob(explicitJobId);
        } else if (accountId) {
          const res = await query<{ id: string }>(
            `SELECT id FROM slideshow_jobs WHERE account_id = $1 AND content_type = 'shorts' AND status NOT IN ('published', 'failed') ORDER BY created_at DESC LIMIT 1`,
            [accountId]
          );
          job = res.rows[0] ? await db.getJob(res.rows[0].id) : null;
        }
        if (job?.id) {
          await db.updateJob(job.id, { status: 'failed', error_message: error.message });
          if (accountId) {
            const creds = await getAccountCredentials(accountId);
            await cleanupJobArtifacts(job.id, creds);
          }
        }
      } catch (dbErr: any) {
        console.error(`[CRITICAL] Failed to update job failure status or cleanup: ${dbErr.message}`);
      }
    }
  },
  async ({ step, event }) => {
    const accountId: string = event.data.accountId;
    const explicitJobId: string | undefined = event.data.jobId;
    const skipPublish: boolean = event.data.skipPublish === true;

    // ── Step 1: Script + GPU warmup (parallel) ────────────────────────────────────
    const generateScriptTask = async () => {
      const jobToResume = await step.run('check-resume', async () => {
        const job = explicitJobId ? await db.getJob(explicitJobId) : await db.getIncompleteJob(accountId);
        if (job && !job.script) {
          await db.updateJob(job.id, { status: 'failed', error_message: 'Abandoned before script generation completed' });
          return null;
        }
        return job;
      });
      
      if (jobToResume) {
        return { script: jobToResume.script, jobId: jobToResume.id, format_template: jobToResume.format_template, niche: jobToResume.niche, variant: jobToResume.variant ?? 'A', topic: jobToResume.topic };
      }

      const niche = ACCOUNT_NICHE[accountId] ?? NICHES[Math.floor(Math.random() * NICHES.length)];
      const variant = Math.random() < 0.5 ? 'A' : 'B';
      
      const jobId = await step.run('create-job', () => 
        db.createJob({ account_id: accountId, topic: 'Generating Script...', niche, format_template: 'pending', script: null, status: 'pending', variant })
      );
      
      const { script, topic, formatTemplate: chosenFormat } = await generateScript(step, niche, accountId);
      
      await step.run('update-job', () => 
        db.updateJob(jobId, { topic, format_template: chosenFormat, script, status: 'script_ready' })
      );
      
      return { script, jobId, format_template: chosenFormat, niche, variant, topic };
    };

    const scriptResult = await generateScriptTask();

    await executeAssetPipeline(
      step, accountId, scriptResult.jobId, scriptResult.script, scriptResult.format_template, 
      scriptResult.niche, scriptResult.topic, skipPublish, false, scriptResult.variant
    );
  }
);

export const generateLongForm = inngest.createFunction(
  {
    id: 'generate-long-form',
    retries: 1,
    timeouts: { finish: '20m' },
    concurrency: { key: 'event.data.accountId', limit: 1 },
    triggers: [{ event: 'slideshow/trigger-long' }],
    onFailure: async ({ error, event }) => {
      console.error(`[CRITICAL] Long-form pipeline failed: ${error.message}`);
      const accountId = (event as any)?.data?.accountId;
      const explicitJobId = (event as any)?.data?.jobId;
      try {
        // Use a targeted query for pending jobs to avoid races between concurrent
        // runs for the same account (getIncompleteJobByType can find the WRONG job
        // when multiple executions exist simultaneously).
        let job;
        if (explicitJobId) {
          job = await db.getJob(explicitJobId);
        } else if (accountId) {
          const res = await query<{ id: string }>(
            `SELECT id FROM slideshow_jobs WHERE account_id = $1 AND content_type = 'long' AND status NOT IN ('published', 'failed') ORDER BY created_at DESC LIMIT 1`,
            [accountId]
          );
          job = res.rows[0] ? await db.getJob(res.rows[0].id) : null;
        }
        if (job?.id) {
          await db.updateJob(job.id, { status: 'failed', error_message: error.message });
          if (accountId) {
            const creds = await getAccountCredentials(accountId);
            await cleanupJobArtifacts(job.id, creds);
          }
        }
      } catch (dbErr: any) {
        console.error(`[CRITICAL] Failed to update long-form job failure status or cleanup: ${dbErr.message}`);
      }
    },
  },
  async ({ step, event }) => {
    const accountId: string = event.data.accountId;
    const explicitJobId: string | undefined = event.data.jobId;
    const skipPublish: boolean = event.data.skipPublish === true;

    // ── Step 1: Script + GPU warmup (parallel) ────────────────────────────────────
    const generateLongFormScriptTask = async () => {
      const jobToResume = await step.run('check-resume', async () => {
        const job = explicitJobId ? await db.getJob(explicitJobId) : await db.getIncompleteJobByType(accountId, 'long');
        if (job && !job.script) {
          await db.updateJob(job.id, { status: 'failed', error_message: 'Abandoned before script generation completed' });
          return null;
        }
        return job;
      });
      
      if (jobToResume) {
        return { script: jobToResume.script, jobId: jobToResume.id, format_template: jobToResume.format_template, niche: jobToResume.niche, topic: jobToResume.topic };
      }

      const niche = ACCOUNT_NICHE[accountId] ?? NICHES[Math.floor(Math.random() * NICHES.length)];
      
      const jobId = await step.run('create-job', () => 
        db.createJob({ account_id: accountId, topic: 'Generating Script...', niche, format_template: 'pending', script: null, status: 'pending', content_type: 'long' })
      );
      
      const { script, topic, formatTemplate } = await generateLongFormScript(step, niche, accountId);
      
      await step.run('update-job', () => 
        db.updateJob(jobId, { topic, format_template: formatTemplate, script, status: 'script_ready' })
      );
      
      return { script, jobId, format_template: formatTemplate, niche, topic };
    };

    const scriptResult = await generateLongFormScriptTask();

    await executeAssetPipeline(
      step, accountId, scriptResult.jobId, scriptResult.script, scriptResult.format_template, 
      scriptResult.niche, scriptResult.topic, skipPublish, true, null
    );
  }
);

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
    const channels = await step.run('get-and-shuffle-channels', async () => {
      const result = await query<{ id: string }>("SELECT id FROM accounts WHERE status = 'active'");
      const activeChannels = result.rows.map(r => ({ account_id: r.id, niche: ACCOUNT_NICHE[r.id] }));
      for (let i = activeChannels.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [activeChannels[i], activeChannels[j]] = [activeChannels[j], activeChannels[i]];
      }
      return activeChannels;
    });

    if (channels.length === 0) return { accountsTriggered: 0, accountsSkipped: 0 };

    let triggeredAccountId: string | null = null;
    let skipped = 0;

    for (const channel of channels) {
      const isCoolingDown = await step.run(`check-throttle-${channel.account_id}`, async () => {
        const recent = await query<{ id: string }>(
          `SELECT id FROM slideshow_jobs WHERE account_id = $1 AND created_at > NOW() - INTERVAL '16 hours' LIMIT 1`,
          [channel.account_id]
        );
        return recent.rows.length > 0;
      });

      if (!isCoolingDown) {
        await step.sendEvent(`trigger-${channel.account_id}`, {
          name: 'slideshow/trigger',
          data: { accountId: channel.account_id },
        });
        triggeredAccountId = channel.account_id;
        break;
      } else {
        skipped++;
      }
    }
    return { accountsTriggered: triggeredAccountId ? 1 : 0, accountsSkipped: skipped };
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

export const longFormScheduler = inngest.createFunction(
  {
    id: 'long-form-scheduler',
    retries: 1,
    triggers: [{ cron: '0 11 * * *' }],
    onFailure: async ({ error }) => {
      console.error(`[CRITICAL] Long-form scheduler failed: ${error.message}`);
    },
  },
  async ({ step }) => {
  
    const accounts = await step.run('get-accounts', async () => {
      const result = await query<{ id: string }>("SELECT id FROM accounts WHERE status = 'active'");
      return result.rows.map(r => r.id);
    });

    let triggered = 0;
    let skipped = 0;

    for (const accountId of accounts) {
      const shouldRun = await step.run(`check-48h-throttle-${accountId}`, async () => {
        const recent = await db.getLastJobByType(accountId, 'long', 48);
        return recent === null;
      });

      if (shouldRun) {
        await step.sendEvent(`trigger-long-${accountId}`, {
          name: 'slideshow/trigger-long',
          data: { accountId },
        });
        triggered++;
      } else {
        skipped++;
      }
    }
    return { triggered, skipped };
  }
);