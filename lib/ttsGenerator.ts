// lib/ttsGenerator.ts
import { GoogleGenAI, type GenerateContentConfig } from '@google/genai';
import {
  TTS_MODEL,
  TTS_SAMPLE_RATE,
  TTS_VOICE_PROFILES,
  DEFAULT_TTS_VOICE_PROFILE,
  type TTSVoiceProfile,
} from './constants';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

export function buildTTSPrompt(profile: TTSVoiceProfile, slideText: string, audioTag: string): string {
  const tag = audioTag.trim();
  return `${profile.directorNotes}\n\n### TRANSCRIPT\n${tag} ${slideText}`;
}

export type SlideInput = {
  text: string;
  audio_tag: string;
};

export type TTSResult = {
  audioBuffer: Buffer;
  durationEstimateMs: number;
};

const MAX_TTS_RETRIES = 3;

export async function generateSlideAudio(
  slide: SlideInput,
  niche: string,
): Promise<TTSResult> {
  const client = getClient();
  const voiceProfile = TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE;
  const ttsPrompt = buildTTSPrompt(voiceProfile, slide.text, slide.audio_tag);

  for (let attempt = 1; attempt <= MAX_TTS_RETRIES; attempt++) {
    try {
      const config: GenerateContentConfig = {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceProfile.voice,
            },
          },
        },
      };

      const response = await client.models.generateContent({
        model: TTS_MODEL,
        contents: [{ role: 'user', parts: [{ text: ttsPrompt }] }],
        config,
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.inlineData?.mimeType?.startsWith('audio/')
      );

      if (!audioPart?.inlineData?.data) {
        if (attempt === MAX_TTS_RETRIES) {
          throw new Error(`TTS returned no audio data after ${MAX_TTS_RETRIES} attempts`);
        }
        console.warn(`[TTS] Attempt ${attempt}: no audio data, retrying...`);
        await new Promise(res => setTimeout(res, 1000 * attempt));
        continue;
      }

      const audioBuffer = Buffer.from(audioPart.inlineData.data as string, 'base64');
      const durationMs = (audioBuffer.length / 2 / TTS_SAMPLE_RATE) * 1000;

      return { audioBuffer, durationEstimateMs: durationMs };
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const code: string = err?.code ?? '';
      const isRetryable =
        msg.includes('500') ||
        msg.includes('502') ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('429') ||
        msg.includes('audio tokens') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNRESET') ||
        msg.includes('ECONNREFUSED') ||
        msg.includes('ENOTFOUND') ||
        msg.includes('fetch failed') ||
        msg.includes('socket hang up') ||
        msg.includes('network') ||
        msg.includes('timeout') ||
        msg.includes('abort') ||
        code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        code === 'ENOTFOUND';

      if (attempt < MAX_TTS_RETRIES && isRetryable) {
        console.warn(`[TTS] Attempt ${attempt} failed with retryable error. Retrying...`);
        await new Promise(res => setTimeout(res, 1500 * attempt));
        continue;
      }
      throw err;
    }
  }

  throw new Error('TTS generation failed after all retries');
}

export async function generateAllSlideAudio(
  slides: SlideInput[],
  niche: string,
): Promise<TTSResult[]> {
  const results: TTSResult[] = [];
  const voiceName = (TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE).voice;

  console.log(`[TTS] Starting generation for ${slides.length} slides — voice: ${voiceName}`);

  // Executed sequentially to prevent TTS rate limit stacking
  for (let i = 0; i < slides.length; i++) {
    const result = await generateSlideAudio(slides[i], niche);
    console.log(`[TTS] Slide ${i + 1}/${slides.length}: ${(result.durationEstimateMs / 1000).toFixed(1)}s`);
    results.push(result);
  }

  const totalMs = results.reduce((sum, r) => sum + r.durationEstimateMs, 0);
  console.log(`[TTS] Total estimated duration: ${(totalMs / 1000).toFixed(1)}s`);

  return results;
}