// Path: inngest/pipeline.ts
import { inngest } from './client';
import { GoogleGenAI } from '@google/genai';
import { pickUnusedTopic, generateScript } from '@/lib/topicGenerator';
import { burnCaption } from '@/lib/imageGenerator';
import { uploadSlideImage, uploadSlideAudio, uploadMusicTrack, uploadVideo, uploadThumbnail, cleanupJobArtifacts } from '@/lib/cloudinary';
import { db, query } from '@/lib/database';
import { IMAGE_MODEL, TTS_MODEL, TTS_VOICE_PROFILES, DEFAULT_TTS_VOICE_PROFILE, MUSIC_MODEL, MODAL_RENDER_URL, ACCOUNT_ID, NICHES, FORMATS } from '@/lib/constants';
import { getAccountCredentials } from '@/lib/accountService';
import { uploadToYouTube } from '@/lib/youtubeUpload';
import { generateThumbnail } from '@/lib/thumbnailGenerator';
import { assembleVideo } from '@/lib/videoAssembler';
import { validateAllCaptions } from '@/lib/captionValidator';
import { syncAnalytics } from '@/lib/analyticsSync';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// ── TTS Prompt Builder ────────────────────────────────────────────────────────
// Uses per-niche voice profiles (Sadaltager for Geography, Orus for History)
// with the dynamic audio_tag from the generated script
function buildTTSPrompt(text: string, niche: string, audioTag?: string): string {
  const tag = audioTag ?? '[conversational]';
  const profile = TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE;

  return `${profile.directorNotes}

### TRANSCRIPT
${tag} ${text}`;
}

function getVoiceForNiche(niche: string): string {
  return (TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE).voice;
}

export const generateHistoryShort = inngest.createFunction(
  {
    id: 'generate-history-short',
    retries: 3,
    triggers: [
      { cron: '0 3 * * *' },   // India: 8:30 AM IST (morning scroll)
      { cron: '0 16 * * *' },  // UK: 5:00 PM BST (after-work)
      { cron: '0 18 * * *' },  // US: 2:00 PM EST / 11:00 AM PST (lunch + morning)
      { event: 'slideshow/trigger' },
    ],
    onFailure: async ({ error, event }) => {
      // Inngest cloud automatically sends an email to the workspace owner when functions fail.
      // We log loudly to ensure the error is properly surfaced in the Neon/Vercel logs.
      console.error(`[CRITICAL] generate-history-short pipeline failed or timed out!`);
      console.error(`Event: ${JSON.stringify(event)}`);
      console.error(`Error: ${error.message}`);
    }
  },
  async ({ step }) => {
    // ── Step 1: Generate Script ──────────────────────────────────────────────
    const { script, jobId, format, niche, variant } = await step.run('generate-script', async () => {
      const niche = NICHES[Math.floor(Math.random() * NICHES.length)];
      const format = FORMATS[Math.floor(Math.random() * FORMATS.length)];
      const variant = Math.random() < 0.5 ? 'A' : 'B'; // A/B testing for retention

      const topic = await pickUnusedTopic(niche);
      const script = await generateScript(topic, format, niche);

      // Validate captions before spending API budget on images/TTS
      const captionResult = validateAllCaptions(script.slides.map(s => ({ text: s.text })));
      if (!captionResult.valid) {
        throw new Error(`Caption validation failed:\n${captionResult.errors.join('\n')}`);
      }

      const jobId = await db.createJob({ account_id: ACCOUNT_ID, topic, niche, format, status: 'script_ready', script, variant });
      return { script, jobId, format, niche, variant };
    });

    // ── Step 2: Submit Batch Job ─────────────────────────────────────────────
    const batchJobName = await step.run('submit-batch', async () => {
      const inlineRequests = [
        // 9 image requests
        ...script.slides.map((slide: any, i: number) => ({
          key: `image-${i}`,
          contents: [{ role: 'user', parts: [{ text: slide.image_prompt }] }],
          config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '9:16' } },
        })),
        // 9 TTS requests
        ...script.slides.map((slide: any, i: number) => ({
          key: `audio-${i}`,
          contents: [{
            role: 'user',
            parts: [{ text: buildTTSPrompt(slide.text, niche, slide.audio_tag) }],
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

      const imageBatch = await ai.batches.create({
        model: IMAGE_MODEL,
        src: inlineRequests.filter(r => r.key.startsWith('image')),
        config: { displayName: `images-${jobId}` },
      });

      const audioBatch = await ai.batches.create({
        model: TTS_MODEL,
        src: inlineRequests.filter(r => r.key.startsWith('audio')),
        config: { displayName: `audio-${jobId}` },
      });

      await db.updateJob(jobId, {
        status: 'batch_pending',
        imageBatchName: imageBatch.name,
        audioBatchName: audioBatch.name,
      });

      return { imageBatchName: imageBatch.name, audioBatchName: audioBatch.name };
    });

    // ── Step 3: Poll batches with linear high-frequency intervals ───────────
    // Polling every 1 minute eliminates the massive artificial spikes of exponential backoff
    let bothDone = false;
    const MAX_POLLS = 45; // 45 minutes hard limit

    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      const isDone = await step.run(`poll-batch-${attempt}`, async () => {
        const [imageJob, audioJob] = await Promise.all([
          ai.batches.get({ name: batchJobName.imageBatchName as string }),
          ai.batches.get({ name: batchJobName.audioBatchName as string }),
        ]);

        const imageState = imageJob.state as string;
        const audioState = audioJob.state as string;

        if (imageState === 'JOB_STATE_FAILED' || imageState === 'JOB_STATE_CANCELLED' || imageState === 'JOB_STATE_EXPIRED') {
          throw new Error(`Image batch ${imageState}: ${batchJobName.imageBatchName}`);
        }
        if (audioState === 'JOB_STATE_FAILED' || audioState === 'JOB_STATE_CANCELLED' || audioState === 'JOB_STATE_EXPIRED') {
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
      throw new Error('Batch polling exhausted 45 attempts (45m hard timeout limit) without completion');
    }

    // ── Step 4: Harvest + Caption + Upload ──────────────────────────────────
    const { imageUrls, audioUrls } = await step.run('harvest-assets', async () => {
      const creds = await getAccountCredentials(ACCOUNT_ID);
      const imageUrls: string[] = [];
      const audioUrls: string[] = [];

      const [imageJob, audioJob] = await Promise.all([
        ai.batches.get({ name: batchJobName.imageBatchName as string }),
        ai.batches.get({ name: batchJobName.audioBatchName as string }),
      ]);
      const imageResponses = imageJob.dest?.inlinedResponses || [];
      const audioResponses = audioJob.dest?.inlinedResponses || [];

      for (let i = 0; i < script.slides.length; i++) {
        const imgPrompt = script.slides[i].image_prompt;
        const imgRespObj = imageResponses.find((r: any) => r.request?.contents?.[0]?.parts?.[0]?.text === imgPrompt) || imageResponses[i];
        const imgResponse = imgRespObj?.response;
        const imgFinishReason = imgResponse?.candidates?.[0]?.finishReason;
        const imgPart = imgResponse?.candidates?.[0]?.content?.parts
          ?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
        let rawBuffer = imgPart?.inlineData?.data
          ? Buffer.from(imgPart.inlineData.data, 'base64')
          : Buffer.alloc(0);

        if (rawBuffer.length === 0) {
          console.warn(`[Pipeline] Slide ${i} batch image failed (${imgFinishReason}), generating synchronously...`);
          const syncResp = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [{ role: 'user', parts: [{ text: imgPrompt }] }],
            config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '9:16' } },
          });
          const syncPart = syncResp.candidates?.[0]?.content?.parts
            ?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
          rawBuffer = Buffer.from(syncPart?.inlineData?.data || '', 'base64');
        }

        const captionedBuffer = await burnCaption(rawBuffer, script.slides[i].text);
        const imageUrl = await uploadSlideImage(captionedBuffer, jobId, i, creds);
        imageUrls.push(imageUrl);

        const audioPrompt = buildTTSPrompt(script.slides[i].text, niche, script.slides[i].audio_tag);
        const audioRespObj = audioResponses.find((r: any) => r.request?.contents?.[0]?.parts?.[0]?.text === audioPrompt) || audioResponses[i];
        const audioResponse = audioRespObj?.response;
        const audioPart = audioResponse?.candidates?.[0]?.content?.parts
          ?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
        let audioBuffer = audioPart?.inlineData?.data
          ? Buffer.from(audioPart.inlineData.data, 'base64')
          : Buffer.alloc(0);

        if (audioBuffer.length === 0) {
          console.warn(`[Pipeline] Slide ${i} batch audio failed, generating synchronously...`);
          const syncResp = await ai.models.generateContent({
            model: TTS_MODEL,
            contents: [{ role: 'user', parts: [{ text: audioPrompt }] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: getVoiceForNiche(niche) } },
              },
            },
          });
          const syncPart = syncResp.candidates?.[0]?.content?.parts
            ?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
          audioBuffer = Buffer.from(syncPart?.inlineData?.data || '', 'base64');
        }

        const audioUrl = await uploadSlideAudio(audioBuffer, jobId, i, creds);
        audioUrls.push(audioUrl);
      }

      await db.updateJob(jobId, { status: 'assets_ready' });
      return { imageUrls, audioUrls };
    });

    // ── Step 5: Generate Background Music ───────────────────────────────────
    const musicUrl = await step.run('generate-music', async () => {
      const creds = await getAccountCredentials(ACCOUNT_ID);
      const prompt = `Cinematic ${niche} underscore for a ${format} video about: ${script.title}. Tense, engaging, no lyrics, dramatic pacing, appropriate instrumentation.`;

      const response = await ai.models.generateContent({
        model: MUSIC_MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
      if (!audioPart?.inlineData) {
        throw new Error('No music data returned from Lyria-3');
      }

      const buffer = Buffer.from(audioPart.inlineData.data as string, 'base64');
      return uploadMusicTrack(buffer, jobId, creds);
    });

    // ── Step 6: Generate thumbnail & Render ──────────────────────────────────
    const videoUrl = await step.run('render-video', async () => {
      const creds = await getAccountCredentials(ACCOUNT_ID);

      const thumbBuffer = await generateThumbnail(script.title, script.thumbnailPrompt, niche);
      const thumbnailUrl = await uploadThumbnail(thumbBuffer, jobId, creds);
      await db.updateJob(jobId, { thumbnail_url: thumbnailUrl });

      // Modal render — skip if placeholder URL
      const useModal = MODAL_RENDER_URL && !MODAL_RENDER_URL.includes('example-modal-url');
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
            return mp4Url;
          }
          console.warn(`[Pipeline] Modal returned ${response.status}, falling back to local assembler`);
        } catch (e) {
          console.warn(`[Pipeline] Modal unreachable: ${e}, falling back to local assembler`);
        }
      }

      // Local fallback — ffmpeg Ken Burns + xfade + background music
      const videoBuffer = await assembleVideo(imageUrls, audioUrls, jobId);
      return uploadVideo(videoBuffer, jobId, creds);
    });

    // ── Step 7: Publish ──────────────────────────────────────────────────────
    await step.run('publish', async () => {
      const creds = await getAccountCredentials(ACCOUNT_ID);

      const jobRecord = await query('SELECT thumbnail_url FROM slideshow_jobs WHERE id = $1', [jobId]);
      const thumbRes = await fetch(jobRecord.rows[0].thumbnail_url);
      if (!thumbRes.ok) throw new Error('Failed to fetch thumbnail for YouTube upload');
      const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());

      const result = await uploadToYouTube(videoUrl, thumbBuffer, script, creds);

      await query(
        `INSERT INTO slideshow_uploads (job_id, youtube_video_id, title, description, tags, variant)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, result.youtubeVideoId, result.title, result.description, JSON.stringify(script.tags), variant]
      );

      await db.updateJob(jobId, { status: 'published', video_url: videoUrl, youtube_video_id: result.youtubeVideoId });

      // Cleanup Cloudinary artifacts to save storage
      await cleanupJobArtifacts(jobId, creds);
    });
  }
);

// ── Analytics Sync ─────────────────────────────────────────────────────────────
// Runs daily at 5am UTC — after the 2am generation pipeline — polling YouTube
// for view counts on published videos so niche performance reports stay fresh.
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
