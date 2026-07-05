// lib/audioEngine.ts
import { TTS_VOICE_PROFILES, DEFAULT_TTS_VOICE_PROFILE } from './constants';

const MAX_RETRIES = 3;

async function callEdgeTts(text: string, voice: string): Promise<Buffer> {
  const url = process.env.EDGE_TTS_URL;
  const apiKey = process.env.EDGE_TTS_API_KEY;

  if (!url) {
    throw new Error('Missing EDGE_TTS_URL environment variable.');
  }

  // openai-edge-tts (travisvn/openai-edge-tts) exposes OpenAI-compatible endpoint:
  // POST /v1/audio/speech  { model, input, voice }
  const response = await fetch(`${url}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice,
      response_format: 'mp3',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Edge TTS API responded with status code ${response.status}: ${body}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generateNarrativeSpeech(fullText: string, niche: string): Promise<{ audioBuffer: Buffer; engine: string }> {
  const profile = TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE;
  const voice = profile.fallbackVoice;

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
      // Exponential backoff before retrying
      await new Promise(res => setTimeout(res, attempt * 2000));
    }
  }

  throw new Error('Unreachable pipeline execution state');
}