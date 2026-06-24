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

// Gemini TTS returns raw PCM (16-bit, 24kHz, mono). Prepend WAV header.
function pcmToWav(pcmData: Buffer): Buffer {
  const numChannels = 1;
  const sampleRate = 24000;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmData.length;

  const header = Buffer.allocUnsafe(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);          // PCM chunk size
  header.writeUInt16LE(1, 20);           // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 26);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

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

  const pcmBuffer = Buffer.from(inlineData.data, 'base64');
  return pcmToWav(pcmBuffer);
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
