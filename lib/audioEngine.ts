// Path: lib/audioEngine.ts
import { TTS_VOICE_PROFILES, DEFAULT_TTS_VOICE_PROFILE } from './constants';
import { callFishAudio } from './fishAudio';
import { callEdgeTts } from './edgeTts';

const MAX_RETRIES = 3;

export async function generateNarrativeSpeech(
  fullText: string,
  niche: string,
): Promise<{ audioBuffer: Buffer; engine: string }> {
  const profile = TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[AudioEngine] Fish Audio attempt ${attempt} for niche: ${niche}`);
      const audioBuffer = await callFishAudio(fullText, profile.referenceId, profile.directorNotes);
      return { audioBuffer, engine: 'fish_audio' };
    } catch (error: any) {
      console.error(`[AudioEngine] Fish Audio failed on attempt ${attempt}: ${error.message}`);
      if (attempt === MAX_RETRIES) break;
      await new Promise(res => setTimeout(res, attempt * 2000));
    }
  }

  console.warn(`[AudioEngine] Fish Audio exhausted. Falling back to Edge TTS (${profile.fallbackVoice}).`);
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const audioBuffer = await callEdgeTts(fullText, profile.fallbackVoice);
      return { audioBuffer, engine: 'edge_tts' };
    } catch (error: any) {
      console.error(`[AudioEngine] Edge TTS fallback failed on attempt ${attempt}: ${error.message}`);
      if (attempt === MAX_RETRIES) {
        throw new Error('[AudioEngine] CRITICAL: Both Fish Audio and Edge TTS failed after all retries.');
      }
      await new Promise(res => setTimeout(res, attempt * 2000));
    }
  }

  throw new Error('Unreachable audio engine state');
}
