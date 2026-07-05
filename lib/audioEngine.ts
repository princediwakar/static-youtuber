// Path: lib/audioEngine.ts
import { F5_TTS_URL, F5_TTS_API_KEY } from './constants';

const MAX_RETRIES = 3;

// F5-TTS on Modal: GPU cold start (~40s) + chunked synthesis of a full
// narration (~60-120s) = up to ~3 minutes total. Give it 8 minutes before
// treating the request as hung, which comfortably covers any cold start.
const FETCH_TIMEOUT_MS = 8 * 60 * 1000;

/**
 * Single attempt: POST to F5-TTS Modal endpoint, return WAV buffer.
 * Each call creates a fresh AbortController so retries get full timeout.
 */
async function callF5Tts(text: string): Promise<Buffer> {
  if (!F5_TTS_URL) {
    throw new Error('[AudioEngine] Missing F5_TTS_URL environment variable.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(F5_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(F5_TTS_API_KEY && { Authorization: `Bearer ${F5_TTS_API_KEY}` }),
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `F5-TTS endpoint responded ${response.status}: ${body.slice(0, 400)}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength < 44) {
      // WAV header is 44 bytes minimum — anything smaller is a corrupt/empty response
      throw new Error(
        `F5-TTS returned suspiciously small audio buffer (${arrayBuffer.byteLength} bytes) — synthesis likely failed silently`
      );
    }

    return Buffer.from(arrayBuffer);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        `F5-TTS request timed out after ${FETCH_TIMEOUT_MS / 1000}s — Modal cold start or synthesis took too long`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Generates a voice-cloned narration track for the full script text.
 * Returns the audio as a WAV buffer (F5-TTS Modal endpoint outputs WAV).
 *
 * The `_niche` parameter is kept to preserve the call-site contract in
 * pipeline.ts — F5-TTS uses a single global voice profile, so niche-specific
 * voice selection no longer applies.
 */
export async function generateNarrativeSpeech(
  fullText: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _niche: string
): Promise<{ audioBuffer: Buffer; engine: string }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[AudioEngine] F5-TTS attempt ${attempt}/${MAX_RETRIES} — ${fullText.length} chars`
      );
      const audioBuffer = await callF5Tts(fullText);
      console.log(
        `[AudioEngine] F5-TTS success — ${audioBuffer.byteLength.toLocaleString()} bytes`
      );
      return { audioBuffer, engine: 'f5_tts' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AudioEngine] Attempt ${attempt} failed: ${message}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `[AudioEngine] CRITICAL: F5-TTS failed after ${MAX_RETRIES} attempts. Last error: ${message}`
        );
      }
      const backoffMs = attempt * 5_000;
      console.log(`[AudioEngine] Retrying in ${backoffMs / 1000}s...`);
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }

  throw new Error('[AudioEngine] Unreachable pipeline execution state');
}