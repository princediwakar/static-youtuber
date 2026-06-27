// Path: lib/edgeTts.ts
import { EDGE_TTS_URL, EDGE_TTS_API_KEY } from './constants';

async function callEdgeTts(text: string, voice: string, retries: number = 3): Promise<Buffer> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${EDGE_TTS_URL}/v1/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${EDGE_TTS_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: text, voice, response_format: 'mp3' }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'unknown');
        const msg = `EdgeTTS error ${res.status}: ${errorText.slice(0, 500)}`;

        const isRetryable =
          res.status === 502 || res.status === 503 || res.status === 504 || res.status === 429;

        if (attempt < retries && isRetryable) {
          const delay = 1500 * attempt;
          console.warn(`[EdgeTTS] Attempt ${attempt} failed with ${res.status}, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(msg);
      }

      return Buffer.from(await res.arrayBuffer());
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const isRetryable =
        msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET') ||
        msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') ||
        msg.includes('fetch failed') || msg.includes('socket hang up') ||
        msg.includes('network') || msg.includes('timeout') || msg.includes('abort');

      if (attempt < retries && isRetryable) {
        const delay = 1500 * attempt;
        console.warn(`[EdgeTTS] Attempt ${attempt} failed with network error, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error('EdgeTTS generation failed after all retries');
}

export async function generateSpeech(text: string, voice: string): Promise<Buffer> {
  return callEdgeTts(text, voice);
}
