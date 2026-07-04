// lib/audioEngine.ts
import { TTS_VOICE_PROFILES, DEFAULT_TTS_VOICE_PROFILE } from './constants';

const MAX_RETRIES = 3;

async function callEdgeTts(text: string, voice: string): Promise<Buffer> {
  const url = process.env.EDGE_TTS_URL;
  const apiKey = process.env.EDGE_TTS_API_KEY;
  
  if (!url) {
    throw new Error("Missing EDGE_TTS_URL configuration environment variable.");
  }

  const response = await fetch(`${url}/v1/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
    },
    body: JSON.stringify({ text, voice, output_format: 'audio-24khz-48kbps-mp3' }),
  });

  if (!response.ok) {
    throw new Error(`Edge TTS API responded with status code ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
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