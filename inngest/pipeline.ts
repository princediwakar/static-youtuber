// Path: inngest/pipeline.ts
import { inngest } from './client';
import { GoogleGenAI } from '@google/genai';
import { pickUnusedTopic, generateScript } from '@/lib/topicGenerator';
import { burnCaption } from '@/lib/imageGenerator';
import { uploadSlideImage, uploadSlideAudio, uploadMusicTrack, uploadVideo, uploadThumbnail } from '@/lib/cloudinary';
import { db, query } from '@/lib/database';
import { IMAGE_MODEL, TTS_MODEL, TTS_VOICE, TTS_SAMPLE_RATE, MUSIC_MODEL, MODAL_RENDER_URL, ACCOUNT_ID } from '@/lib/constants';
import { getAccountCredentials } from '@/lib/accountService';
import { uploadToYouTube } from '@/lib/youtubeUpload';
import { generateThumbnail } from '@/lib/thumbnailGenerator';
import { assembleVideo } from '@/lib/videoAssembler';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// ── TTS Prompt Builder ────────────────────────────────────────────────────────
// Replaces wrapInSSML(). Uses Gemini 3.1 TTS audio tags for expressiveness.
function buildTTSPrompt(text: string, slideIndex: number): string {
  const audioTags: Record<number, string> = {
    0: '[gravely, measured]',   // Hook — open loop lands deliberately
    2: '[amazed]',              // Twist — dopamine hit slide
    6: '[gravely]',             // Payoff — closes the loop
    7: '[warm, conversational]', // Modern connection
    8: '[warm]',                // CTA
  };

  const tag = audioTags[slideIndex] ?? '[serious, engaged]';

  return `
# AUDIO PROFILE: The Chronicler
### DIRECTOR'S NOTES
Style: Authoritative documentary narrator. Measured gravitas with genuine
wonder breaking through on key revelations. Clear, commanding delivery.
Pacing: Deliberate. Let facts land. No rushing.
Accent: Clear mid-Atlantic, no regional markers.
### TRANSCRIPT
${tag} ${text}
<break time="250ms"/>
  `.trim();
}

export const generateHistoryShort = inngest.createFunction(
  {
    id: 'generate-history-short',
    retries: 3,
    triggers: [
      { cron: '0 2 * * *' },
      { event: 'slideshow/trigger' },
    ]
  },
  async ({ step }) => {
    // ── Step 1: Generate Script ──────────────────────────────────────────────
    const { script, jobId } = await step.run('generate-script', async () => {
      const topic = await pickUnusedTopic();
      const script = await generateScript(topic);
      const jobId = await db.createJob({ account_id: ACCOUNT_ID, topic, status: 'script_ready', script });
      return { script, jobId };
    });

    // ── Step 2: Submit Batch Job ─────────────────────────────────────────────
    const batchJobName = await step.run('submit-batch', async () => {
      const inlineRequests = [
        // 9 image requests
        ...script.slides.map((slide: any, i: number) => ({
          key: `image-${i}`,
          contents: [{ role: 'user', parts: [{ text: slide.image_prompt }] }],
          config: { responseModalities: ['IMAGE', 'TEXT'] },
        })),
        // 9 TTS requests
        ...script.slides.map((slide: any, i: number) => ({
          key: `audio-${i}`,
          contents: [{
            role: 'user',
            parts: [{ text: buildTTSPrompt(slide.text, i) }],
          }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: TTS_VOICE },
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

    // ── Step 3: Poll batches with escalating intervals ──────────────────────
    // Each attempt is a separately-named step so Inngest doesn't memoize stale state.
    // step.sleep() lives at the function level between step.run() calls.
    const POLL_INTERVALS = ['2m', '4m', '10m', '20m', '20m', '20m'];
    const TERMINAL_STATES = new Set([
      'JOB_STATE_SUCCEEDED',
      'JOB_STATE_FAILED',
      'JOB_STATE_CANCELLED',
      'JOB_STATE_EXPIRED',
    ]);

    let bothDone = false;

    for (let attempt = 0; attempt < POLL_INTERVALS.length; attempt++) {
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

      if (attempt < POLL_INTERVALS.length - 1) {
        await step.sleep(`wait-batch-${attempt}`, POLL_INTERVALS[attempt]);
      }
    }

    if (!bothDone) {
      throw new Error('Batch polling exhausted all attempts without completion');
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

      for (let i = 0; i < 9; i++) {
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
            config: { responseModalities: ['IMAGE', 'TEXT'] },
          });
          const syncPart = syncResp.candidates?.[0]?.content?.parts
            ?.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));
          rawBuffer = Buffer.from(syncPart?.inlineData?.data || '', 'base64');
        }

        const captionedBuffer = await burnCaption(rawBuffer, script.slides[i].text);
        const imageUrl = await uploadSlideImage(captionedBuffer, jobId, i, creds);
        imageUrls.push(imageUrl);

        const audioPrompt = buildTTSPrompt(script.slides[i].text, i);
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
                voiceConfig: { prebuiltVoiceConfig: { voiceName: TTS_VOICE } },
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

      return { imageUrls, audioUrls };
    });

    // ── Step 5: Generate Background Music ───────────────────────────────────
    const musicUrl = await step.run('generate-music', async () => {
      const creds = await getAccountCredentials(ACCOUNT_ID);
      const prompt = `Cinematic historical documentary underscore for a video about: ${script.title}. Tense orchestral, no lyrics, dramatic pacing, period-appropriate instrumentation.`;

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

      const thumbBuffer = await generateThumbnail(script.title, script.thumbnailPrompt);
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
        `INSERT INTO slideshow_uploads (job_id, youtube_video_id, title, description, tags)
         VALUES ($1, $2, $3, $4, $5)`,
        [jobId, result.youtubeVideoId, result.title, result.description, JSON.stringify(script.tags)]
      );

      await db.updateJob(jobId, { status: 'published', video_url: videoUrl, youtube_video_id: result.youtubeVideoId });
    });
  }
);
