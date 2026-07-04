// lib/audioEngine.ts
import { TTS_VOICE_PROFILES, DEFAULT_TTS_VOICE_PROFILE } from './constants';

const MAX_RETRIES = 3;

import { tts } from 'edge-tts';

async function callEdgeTts(text: string, voice: string): Promise<Buffer> {
  const buffer = await tts(text, { voice });
  return Buffer.from(buffer);
}

export async function generateNarrativeSpeech(fullText: string, niche: string): Promise<{ audioBuffer: Buffer; engine: string }> {
  const profile = TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE;
  const voice = profile.fallbackVoice; // Remapped cleanly to primary voice field

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[AudioEngine] Edge TTS processing attempt ${attempt}/${MAX_RETRIES} using voice ${voice}`);
      const audioBuffer = await callEdgeTts(fullText, voice);
      return { audioBuffer, engine: 'edge_tts' };
    } catch (error: any) {
      console.error(`[AudioEngine] Edge TTS failure on execution attempt ${attempt}: ${error.message}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(`[AudioEngine] CRITICAL: Edge TTS failed after ${MAX_RETRIES} attempts. Engine halted.`);
      }
      // Linear backoff delay before retrying
      await new Promise(res => setTimeout(res, attempt * 1500));
    }
  }

  throw new Error("Unreachable pipeline execution state");
}