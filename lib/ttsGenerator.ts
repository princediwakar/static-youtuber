// Path: lib/ttsGenerator.ts
import { GoogleGenAI } from '@google/genai';
import { Slide, AccountCredentials } from './types';
import { uploadSlideAudio } from './cloudinary';
import { TTS_MODEL, TTS_VOICE, TTS_CONCURRENCY } from './constants';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

export const TTS_SAMPLE_RATE = 24000; // Gemini TTS outputs 24kHz mono 16-bit PCM

async function generateSingleAudio(text: string): Promise<Buffer> {
  const client = getClient();

  const result = await client.models.generateContent({
    model: TTS_MODEL,
    contents: [{ role: 'user', parts: [{ text }] }],
    config: {
      responseModalities: ['audio'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: TTS_VOICE },
        },
      },
    },
  });

  const inlineData = result.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData?.data) throw new Error('Gemini TTS returned no audio data');

  // Returns raw PCM 16-bit signed LE, 24kHz mono — FFmpeg reads with -f s16le -ar 24000 -ac 1
  return Buffer.from(inlineData.data, 'base64');
}

async function withConcurrencyLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<string>
): Promise<string[]> {
  const results: string[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function generateSlideAudio(
  slides: Slide[],
  jobId: string,
  creds: AccountCredentials
): Promise<string[]> {
  console.log(`[TTS] Generating ${slides.length} audio clips for job ${jobId}`);

  const urls = await withConcurrencyLimit(slides, TTS_CONCURRENCY, async (slide, index) => {
    console.log(`[TTS] Slide ${index + 1}/${slides.length}: "${slide.text.substring(0, 50)}..."`);
    const wavBuffer = await generateSingleAudio(slide.text);
    const url = await uploadSlideAudio(wavBuffer, jobId, index, creds);
    console.log(`[TTS] Slide ${index + 1} audio uploaded: ${url}`);
    return url;
  });

  console.log(`[TTS] All ${slides.length} audio clips generated and uploaded`);
  return urls;
}
