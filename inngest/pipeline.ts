// Path: inngest/pipeline.ts
import { inngest } from './client';
import { GoogleGenAI } from '@google/genai';
import { pickUnusedTopic, generateScript } from '@/lib/topicGenerator';
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
  MUSIC_MODEL, 
  MODAL_RENDER_URL, 
  ACCOUNT_ID, 
  NICHES, 
  FORMATS 
} from '@/lib/constants';
import { getAccountCredentials } from '@/lib/accountService';
import { uploadToYouTube } from '@/lib/youtubeUpload';
import { generateThumbnail } from '@/lib/thumbnailGenerator';
import { assembleVideo } from '@/lib/videoAssembler';
import { validateAllCaptions } from '@/lib/captionValidator';
import { syncAnalytics } from '@/lib/analyticsSync';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

function buildTTSPrompt(text: string, niche: string, audioTag?: string): string {
  const tag = audioTag ?? '[conversational]';
  const profile = TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE;

  return `${profile.directorNotes}\n\n### TRANSCRIPT\n${tag} ${text}`;
}

function getVoiceForNiche(niche: string): string {
  return (TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE).voice;
}

export const generateHistoryShort = inngest.createFunction(
  {
    id: 'generate-history-short',
    retries: 3,
    triggers: [
      { cron: '0 3 * * *' },   
      { cron: '0 16 * * *' },  
      { cron: '0 18 * * *' },  
      { event: 'slideshow/trigger' },
    ],
    onFailure: async ({ error, event }) => {
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
      const variant = Math.random() < 0.5 ? 'A' : 'B'; 

      const topic = await pickUnusedTopic(niche);
      const script = await generateScript(topic, format, niche);

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
        ...script.slides.map((slide: any, i: number) => ({
          contents: [{ role: 'user', parts: [{ text: slide.image_prompt }] }],
          config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
        })),
        ...script.slides.map((slide: any, i: number) => ({
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

      // Slice the array to cleanly separate image and audio requests without relying on fragile string keys
      const imageBatch = await ai.batches.create({
        model: IMAGE_MODEL,
        src: inlineRequests.slice(0, script.slides.length),
        config: { displayName: `images-${jobId}` },
      });

      const audioBatch = await ai.batches.create({
        model: TTS_MODEL,
        src: inlineRequests.slice(script.slides.length),
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
    const { imageUrls, audioUrls } = await step.run('harvest-assets', async () => {
      const creds = await getAccountCredentials(ACCOUNT_ID);
      const imageUrls: string[] = new Array(script.slides.length);
      const audioUrls: string[] = new Array(script.slides.length);

      const [imageJob, audioJob] = await Promise.all([
        ai.batches.get({ name: batchJobName.imageBatchName as string }),
        ai.batches.get({ name: batchJobName.audioBatchName as string }),
      ]);
      
      const imageResponses = imageJob.dest?.inlinedResponses || [];
      const audioResponses = audioJob.dest?.inlinedResponses || [];

      // Process slides sequentially for sharp/canvas memory safety, but execute API fallbacks in parallel
      for (let i = 0; i < script.slides.length; i++) {
        const slide = script.slides[i];
        
        // 1. HARVEST & VALIDATE IMAGE
        // Strict mapping: trim spaces and match exactly to ensure order invariance
        const imgPrompt = slide.image_prompt.trim();
        const imgRespObj = imageResponses.find((r: any) => 
          r.request?.contents?.[0]?.parts?.[0]?.text?.trim() === imgPrompt
        );
        
        let imgPart = imgRespObj?.response?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
        let rawImageBuffer = imgPart?.inlineData?.data ? Buffer.from(imgPart.inlineData.data, 'base64') : Buffer.alloc(0);

        if (rawImageBuffer.length === 0) {
          console.warn(`[Pipeline] Slide ${i} batch image missing/failed. Triggering sync fallback...`);
          const syncResp = await ai.models.generateContent({
            model: IMAGE_MODEL,
            contents: [{ role: 'user', parts: [{ text: slide.image_prompt }] }],
            config: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
          });
          imgPart = syncResp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
          if (!imgPart?.inlineData?.data) throw new Error(`Fallback image generation failed for slide ${i}`);
          rawImageBuffer = Buffer.from(imgPart.inlineData.data, 'base64');
        }

        // Process Canvas/Sharp overlay safely
        const captionedBuffer = await burnCaption(rawImageBuffer, slide.text);
        imageUrls[i] = await uploadSlideImage(captionedBuffer, jobId, i, creds);

        // 2. HARVEST & VALIDATE AUDIO
        const audioPrompt = buildTTSPrompt(slide.text, niche, slide.audio_tag).trim();
        const audioRespObj = audioResponses.find((r: any) => 
          r.request?.contents?.[0]?.parts?.[0]?.text?.trim() === audioPrompt
        );

        let audioPart = audioRespObj?.response?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
        let rawAudioBuffer = audioPart?.inlineData?.data ? Buffer.from(audioPart.inlineData.data, 'base64') : Buffer.alloc(0);

        if (rawAudioBuffer.length === 0) {
          console.warn(`[Pipeline] Slide ${i} batch audio missing/failed. Triggering sync fallback...`);
          const syncResp = await ai.models.generateContent({
            model: TTS_MODEL,
            contents: [{ role: 'user', parts: [{ text: audioPrompt }] }],
            config: {
              responseModalities: ['AUDIO'],
              speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: getVoiceForNiche(niche) } } },
            },
          });
          audioPart = syncResp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.mimeType?.startsWith('audio/'));
          if (!audioPart?.inlineData?.data) throw new Error(`Fallback audio generation failed for slide ${i}`);
          rawAudioBuffer = Buffer.from(audioPart.inlineData.data, 'base64');
        }

        audioUrls[i] = await uploadSlideAudio(rawAudioBuffer, jobId, i, creds);
      }

      await db.updateJob(jobId, { status: 'assets_ready' });
      return { imageUrls, audioUrls };
    });

    // ── Step 5: Generate Background Music ───────────────────────────────────
    const musicUrl = await step.run('generate-music', async () => {
      const creds = await getAccountCredentials(ACCOUNT_ID);
      // FIXED: Injecting the visual world so the audio actually matches the visuals
      const prompt = `Cinematic ${niche} underscore for a ${format} video about: ${script.title}. The visual aesthetic is: ${script.visual_world}. Tense, engaging, no lyrics, dramatic pacing, appropriate instrumentation.`;

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
    const videoUrl = await step.run('render-video', async () => {
      const creds = await getAccountCredentials(ACCOUNT_ID);

      const thumbBuffer = await generateThumbnail(script.title, script.thumbnailPrompt, niche);
      const thumbnailUrl = await uploadThumbnail(thumbBuffer, jobId, creds);
      await db.updateJob(jobId, { thumbnail_url: thumbnailUrl });

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

      const videoBuffer = await assembleVideo(imageUrls, audioUrls, jobId);
      return uploadVideo(videoBuffer, jobId, creds);
    });

    // ── Step 7: Publish ──────────────────────────────────────────────────────
    await step.run('publish', async () => {
      const creds = await getAccountCredentials(ACCOUNT_ID);

      const jobRecord = await query('SELECT thumbnail_url FROM slideshow_jobs WHERE id = $1', [jobId]);
      
      // FIXED: Implement basic retry for external network calls to prevent late-stage crashes
      let thumbRes;
      for(let t = 0; t < 3; t++) {
        thumbRes = await fetch(jobRecord.rows[0].thumbnail_url);
        if (thumbRes.ok) break;
        await new Promise(res => setTimeout(res, 1000));
      }
      
      if (!thumbRes || !thumbRes.ok) throw new Error('Failed to fetch thumbnail for YouTube upload after retries');
      
      const thumbBuffer = Buffer.from(await thumbRes.arrayBuffer());
      const result = await uploadToYouTube(videoUrl, thumbBuffer, script, creds);

      await query(
        `INSERT INTO slideshow_uploads (job_id, youtube_video_id, title, description, tags, variant)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [jobId, result.youtubeVideoId, result.title, result.description, JSON.stringify(script.tags), variant]
      );

      await db.updateJob(jobId, { status: 'published', video_url: videoUrl, youtube_video_id: result.youtubeVideoId });
      await cleanupJobArtifacts(jobId, creds);
    });
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