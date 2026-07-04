// lib/edgeTts.ts
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

/**
 * LEGACY: synthesizes a single, isolated line of text.
 *
 * Do NOT use this per-shot in the video render pipeline anymore. EdgeTTS
 * treats every call as one complete utterance and bakes sentence-boundary
 * prosody (a settle/pause at the start and end) into the audio itself.
 * Calling this once per shot and concatenating the clips is what produces
 * "dead air" between shots — trimming silence afterwards can't undo the
 * cadence that was synthesized in. Keep this around only for standalone
 * use cases (e.g. previewing a single line), not for full-video narration.
 */
export async function generateSpeech(text: string, voice: string): Promise<Buffer> {
  return callEdgeTts(text, voice);
}

/**
 * Synthesizes the ENTIRE narration as one continuous clip so EdgeTTS reads
 * it as a single flowing utterance — natural pauses only where the text
 * actually has punctuation (commas, em-dashes, periods), no artificial
 * per-shot restart cadence.
 *
 * Shots are expected to be verbatim, contiguous slices of the narrative
 * (see the "verbatim slicing" instruction added to the Pass 2 prompt and
 * the shotsMatchNarrative() guard in topicGenerator.ts) — rejoining them
 * with a single space should reproduce the original narrative almost
 * exactly, which is what keeps the word-count-based shot/timestamp
 * alignment in modal/render.py accurate.
 *
 * shotWordCounts is returned so the render step can slice the single
 * Whisper-aligned word timeline back into per-shot start/end timestamps
 * without re-running alignment per shot.
 */
export async function generateNarrativeSpeech(
  shots: { text: string }[],
  voice: string,
): Promise<{ audioBuffer: Buffer; fullText: string; shotWordCounts: number[] }> {
  const fullText = shots.map(s => s.text.trim()).join(' ');
  const shotWordCounts = shots.map(s => s.text.trim().split(/\s+/).filter(Boolean).length);

  const audioBuffer = await callEdgeTts(fullText, voice);

  return { audioBuffer, fullText, shotWordCounts };
}