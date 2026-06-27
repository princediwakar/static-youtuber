// Path: inngest/pipeline.ts
import { inngest } from './client';
import { GoogleGenAI } from '@google/genai';
import { generateScript, pickFormatTemplate } from '@/lib/topicGenerator';
import { burnCaption } from '@/lib/imageGenerator';
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
  IMAGE_MODEL,
  TTS_MODEL,
  TTS_VOICE_PROFILES,
  DEFAULT_TTS_VOICE_PROFILE,
  NICHE_PROFILES,
  DEFAULT_NICHE_PROFILE,
  MUSIC_MODEL,
  MODAL_RENDER_URL,
  NICHES,
  ACCOUNT_NICHE,
} from '@/lib/constants';
import { getAccountCredentials } from '@/lib/accountService';
import { uploadToYouTube } from '@/lib/youtubeUpload';
import { generateThumbnail } from '@/lib/thumbnailGenerator';
import { assembleVideo } from '@/lib/videoAssembler';
import { validateAllCaptions } from '@/lib/captionValidator';
import { syncAnalytics, recordPublishedVideo } from '@/lib/analyticsSync';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function buildTTSPrompt(text: string, niche: string, audioInstruction?: string): string {
  const tag = audioInstruction ?? '[conversational]';
  const profile = TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE;

  return `${profile.directorNotes}\n\n### TRANSCRIPT\n${tag} ${text}`;
}

function getVoiceForNiche(niche: string): string {
  return (TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE).voice;
}

export const generateShort = inngest.createFunction(
  {
    id: 'generate-short',
    retries: 3,
    triggers: [
      { event: 'slideshow/trigger' },
    ],
    onFailure: async ({ error, event }) => {
      console.error(`[CRITICAL] Pipeline failed for event: ${JSON.stringify(event)}`);
      console.error(`Error: ${error.message}`);
    }
  },
  async ({ step, event }) => {
    const accountId: string = event.data.accountId;

    // ── Step 1: Generate Script ──────────────────────────────────────────────
    const { script, jobId, format_template, niche, variant, topic } = await step.run('generate-script', async () => {
      const niche = ACCOUNT_NICHE[accountId] ?? NICHES[Math.floor(Math.random() * NICHES.length)];
      const format_template = pickFormatTemplate(niche);
      const variant = Math.random() < 0.5 ? 'A' : 'B';

      const { script, topic } = await generateScript(niche, accountId);

      const captionResult = validateAllCaptions(script.shots.map(s => ({ text: s.tts_text })));
      if (!captionResult.valid) {
        throw new Error(`Caption validation failed:\n${captionResult.errors.join('\n')}`);
      }

      const jobId = await db.createJob({ account_id: accountId, topic, niche, format_template, script, status: 'script_ready', variant });
      return { script, jobId, format_template, niche, variant, topic };
    });

    // ── Step 2: Submit Batch Job ─────────────────────────────────────────────
    const batchJobName = await step.run('submit-batch', async () => {
      const inlineRequests = [
        ...script.shots.map((shot: any, i: number) => ({
          contents: [{ role: 'user', parts: [{ text: shot.visual_prompt }] }],
          config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
        })),
        ...script.shots.map((shot: any, i: number) => ({
          contents: [{
            role: 'user',
            parts: [{ text: buildTTSPrompt(shot.tts_text, niche, shot.audio_instruction) }],
          }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: getVoiceForNiche(niche) },
              },
            },
          },
        })),
      ];

      // Slice the array to cleanly separate image and audio requests without relying on fragile string keys
      const imageBatch = await ai.batches.create({
        model: IMAGE_MODEL,
        src: inlineRequests.slice(0, script.shots.length),
        config: { displayName: `images-${jobId}` },
      });

      const audioBatch = await ai.batches.create({
        model: TTS_MODEL,
        src: inlineRequests.slice(script.shots.length),
        config: { displayName: `audio-${jobId}` },
      });

      await db.updateJob(jobId, {
        status: 'batch_pending',
        imageBatchName: imageBatch.name,
        audioBatchName: audioBatch.name,
      });

      return { imageBatchName: imageBatch.name, audioBatchName: audioBatch.name };
    });

    // ── Step 3: Poll batches ──────────────────────────────────────────────────
    let bothDone = false;
    const MAX_POLLS = 45;

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      const isDone = await step.run(`poll-batch-${attempt}`, async () => {
        const [imageJob, audioJob] = await Promise.all([
          ai.batches.get({ name: batchJobName.imageBatchName as string }),
          ai.batches.get({ name: batchJobName.audioBatchName as string }),
        ]);

        const imageState = imageJob.state as string;
        const audioState = audioJob.state as string;

        if (['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'].includes(imageState)) {
          throw new Error(`Image batch ${imageState}: ${batchJobName.imageBatchName}`);
        }
        if (['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'].includes(audioState)) {
          throw new Error(`Audio batch ${audioState}: ${batchJobName.audioBatchName}`);
        }

        return imageState === 'JOB_STATE_SUCCEEDED' && audioState === 'JOB_STATE_SUCCEEDED';
      });

      if (isDone) {
        bothDone = true;
        break;
      }

      await step.sleep(`wait-batch-${attempt}`, '1m');
    }

    if (!bothDone) {
      throw new Error('Batch polling exhausted 45 attempts without completion');
    }

    // ── Step 4: Harvest + Caption + Upload ──────────────────────────────────
    const imageUrls: string[] = new Array(script.shots.length);
    const audioUrls: string[] = new Array(script.shots.length);

    const { imageResponses, audioResponses } = await step.run('fetch-batch-results', async () => {
      const [imageJob, audioJob] = await Promise.all([
        ai.batches.get({ name: batchJobName.imageBatchName as string }),
        ai.batches.get({ name: batchJobName.audioBatchName as string }),
      ]);

      return {
        imageResponses: imageJob.dest?.inlinedResponses || [],
        audioResponses: audioJob.dest?.inlinedResponses || [],
      };
    });

    // Process each shot in its own step.run() for memoization
    for (let i = 0; i < script.shots.length; i++) {
      const result = await step.run(`harvest-shot-${i}`, async () => {
        const shot = script.shots[i];
        const creds = await getAccountCredentials(accountId);

        // 1. HARVEST & VALIDATE IMAGE
        // Strict mapping: trim spaces and match exactly to ensure order invariance
        const imgPrompt = shot.visual_prompt.trim();
        const imgRespObj = imageResponses.find((r: any) =>
          r.request?.contents?.[0]?.parts?.[0]?.text?.trim() === imgPrompt
        );

        let imgPart = imgRespObj?.response?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
        let rawImageBuffer = imgPart?.inlineData?.data ? Buffer.from(imgPart.inlineData.data, 'base64') : Buffer.alloc(0);

        if (rawImageBuffer.length === 0) {
          console.warn(`[Pipeline] Shot ${i} batch image missing/failed. Triggering sync fallback...`);
          const syncResp = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [{ role: 'user', parts: [{ text: shot.visual_prompt }] }],
            config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
          });
          imgPart = syncResp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
          if (!imgPart?.inlineData?.data) throw new Error(`Fallback image generation failed for shot ${i}`);
          rawImageBuffer = Buffer.from(imgPart.inlineData.data, 'base64');
        }

        // Process Canvas/Sharp overlay safely — strip any leaked director tags
        const captionText = shot.tts_text.replace(/\[.*?\]\s*/g, '').trim();
        const captionedBuffer = await burnCaption(rawImageBuffer, captionText);
        const imageUrl = await uploadSlideImage(captionedBuffer, jobId, i, creds);

        // 2. HARVEST & VALIDATE AUDIO
        const audioPrompt = buildTTSPrompt(shot.tts_text, niche, shot.audio_instruction).trim();
        const audioRespObj = audioResponses.find((r: any) =>
          r.request?.contents?.[0]?.parts?.[0]?.text?.trim() === audioPrompt
        );

        let audioPart = audioRespObj?.response?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
        let rawAudioBuffer = audioPart?.inlineData?.data ? Buffer.from(audioPart.inlineData.data, 'base64') : Buffer.alloc(0);

        if (rawAudioBuffer.length === 0) {
          console.warn(`[Pipeline] Shot ${i} batch audio missing/failed. Triggering sync fallback...`);
          const syncResp = await ai.models.generateContent({
            model: TTS_MODEL,
            contents: [{ role: 'user', parts: [{ text: audioPrompt }] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: getVoiceForNiche(niche) } } },
            },
          });
          audioPart = syncResp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
          if (!audioPart?.inlineData?.data) throw new Error(`Fallback audio generation failed for shot ${i}`);
          rawAudioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        }

        const audioUrl = await uploadSlideAudio(rawAudioBuffer, jobId, i, creds);

        return { imageUrl, audioUrl };
      });

      imageUrls[i] = result.imageUrl;
      audioUrls[i] = result.audioUrl;
    }

    await step.run('update-assets-ready', async () => {
      await db.updateJob(jobId, {
        status: 'assets_ready',
        shot_image_urls: imageUrls,
        shot_audio_urls: audioUrls,
      });
    });

    // ── Step 5: Generate Background Music ───────────────────────────────────
    const musicUrl = await step.run('generate-music', async () => {
      const creds = await getAccountCredentials(accountId);
      // Injecting the visual world and format template so the audio actually matches the visuals
      const prompt = `Cinematic ${niche} underscore for a ${format_template} video about: ${script.title}. The visual aesthetic is: ${script.visual_world}. Tense, engaging, no lyrics, dramatic pacing, appropriate instrumentation.`;

      const response = await ai.models.generateContent({
        model: MUSIC_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
      if (!audioPart?.inlineData?.data) {
        throw new Error('No music data returned from Lyria-3');
      }

      const buffer = Buffer.from(audioPart.inlineData.data as string, 'base64');
      return uploadMusicTrack(buffer, jobId, creds);
    });

    // ── Step 6: Generate thumbnail & Render ──────────────────────────────────
    const useModal = MODAL_RENDER_URL && !MODAL_RENDER_URL.includes('example-modal-url');

    const videoUrl = await step.run('render-video', async () => {
      const creds = await getAccountCredentials(accountId);

      const thumbBuffer = await generateThumbnail(script.title, script.thumbnailPrompt, niche);
      const thumbnailUrl = await uploadThumbnail(thumbBuffer, jobId, creds);
      await db.updateJob(jobId, { thumbnail_url: thumbnailUrl });

      if (useModal) {
        try {
          const response = await fetch(MODAL_RENDER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageUrls,
              audioUrls,
              musicUrl,
              jobId,
              fps: 25,
              width: 1080,
              height: 1920,
            }),
          });

          if (response.ok) {
            const { mp4Url } = await response.json();
            if (mp4Url) return mp4Url;
          }
          console.warn(`[Pipeline] Modal returned ${response.status}, falling back to local assembler`);
        } catch (e) {
          console.warn(`[Pipeline] Modal unreachable: ${e}, falling back to local assembler`);
        }
      }

      const videoBuffer = await assembleVideo(imageUrls, audioUrls, musicUrl, jobId);
      return uploadVideo(videoBuffer, jobId, creds);
    });

    // ── Step 6b: Wait for Modal webhook if render was sent to Modal ──────────
    let resolvedVideoUrl = videoUrl;

    if (useModal && !videoUrl) {
      const modalResult = await step.waitForEvent('wait-for-modal', {
        event: 'modal/render.complete',
        timeout: '10m',
        match: 'data.jobId',
      }).catch(() => null);

      resolvedVideoUrl = modalResult?.data?.mp4Url;
      if (!resolvedVideoUrl) {
        // Fallback to local assembly
        console.warn(`[Pipeline] Modal webhook never arrived, falling back to local assembler`);
        const videoBuffer = await assembleVideo(imageUrls, audioUrls, musicUrl, jobId);
        const creds = await getAccountCredentials(accountId);
        resolvedVideoUrl = await uploadVideo(videoBuffer, jobId, creds);
      }
    }

    // ── Step 7: Publish ──────────────────────────────────────────────────────
    await step.run('publish', async () => {
      const creds = await getAccountCredentials(accountId);

      const jobRecord = await query('SELECT thumbnail_url FROM slideshow_jobs WHERE id = $1', [jobId]);

      // Implement basic retry for external network calls to prevent late-stage crashes
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

      // Link the topic row to the published YouTube video for analytics attribution
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
export const channelScheduler = inngest.createFunction(
  {
    id: 'channel-scheduler',
    retries: 1,
    triggers: [
      { cron: '0 14 * * *' }, // Once daily at 14:00 UTC (7 AM PST / 10 AM EST)
    ],
    onFailure: async ({ error }) => {
      console.error(`[CRITICAL] Channel scheduler failed: ${error.message}`);
    },
  },
  async ({ step }) => {
    const channels = await step.run('get-channels', async () => {
      const result = await query<{ id: string }>(
        "SELECT id FROM accounts WHERE status = 'active'"
      );
      return result.rows.map(r => ({ account_id: r.id, niche: ACCOUNT_NICHE[r.id] }));
    });

    let triggered = 0;
    let skipped = 0;

    for (const channel of channels) {
      const shouldRun = await step.run(`check-throttle-${channel.account_id}`, async () => {
        // Strict throttle: 1 video per day, per channel.
        // YouTube needs 24h to test seed audience before the next publish.
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

    return { accountsTriggered: triggered, accountsSkipped: skipped };
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
