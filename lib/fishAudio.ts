// Path: lib/fishAudio.ts
import { FISH_AUDIO_MODEL } from './constants';

const FISH_API_BASE = 'https://api.fish.audio';

function validateWav(buffer: Buffer): void {
  if (buffer.length < 44) throw new Error('Audio buffer too small for WAV header');
  if (buffer.slice(0, 4).toString() !== 'RIFF') throw new Error('Not a valid WAV file — missing RIFF header');
  if (buffer.slice(8, 12).toString() !== 'WAVE') throw new Error('Not a valid WAV file — missing WAVE format tag');
  // Fish Audio returns application/json on errors — catch it before FFmpeg does
  if (buffer.slice(0, 7).toString() === '{"error' || buffer[0] === 0x7B) {
    const text = buffer.toString('utf-8').slice(0, 200);
    throw new Error(`Fish Audio returned JSON error instead of WAV: ${text}`);
  }
}

export async function generateSpeech(
  text: string,
  referenceId: string,
  retries: number = 3,
): Promise<Buffer> {
  const apiKey = process.env.FISH_API_KEY;
  if (!apiKey) throw new Error('FISH_API_KEY is not set');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${FISH_API_BASE}/v1/tts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, reference_id: referenceId, format: 'wav', model: FISH_AUDIO_MODEL }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'unknown');
        const msg = `Fish Audio error ${res.status}: ${errorText.slice(0, 500)}`;

        const isRetryable =
          res.status === 502 || res.status === 503 || res.status === 504 ||
          res.status === 429 || msg.includes('fetch failed') ||
          msg.includes('network') || msg.includes('timeout');

        if (attempt < retries && isRetryable) {
          const delay = 1500 * attempt;
          console.warn(`[FishAudio] Attempt ${attempt} failed with retryable error. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(msg);
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      validateWav(buffer);
      return buffer;
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const isRetryable =
        msg.includes('502') || msg.includes('503') || msg.includes('504') ||
        msg.includes('429') || msg.includes('fetch failed') ||
        msg.includes('network') || msg.includes('timeout') ||
        msg.includes('socket hang up') || msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNRESET') || msg.includes('ECONNREFUSED');

      if (attempt < retries && isRetryable) {
        const delay = 1500 * attempt;
        console.warn(`[FishAudio] Attempt ${attempt} failed with retryable error. Retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Fish Audio TTS generation failed after all retries');
}
