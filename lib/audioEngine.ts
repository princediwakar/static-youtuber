// Path: lib/audioEngine.ts
import { F5_TTS_URL, F5_TTS_API_KEY } from './constants';

const MAX_RETRIES = 3;

/**
 * Calls the F5-TTS Modal endpoint and returns raw WAV bytes as a Buffer.
 * The endpoint clones the voice profile uploaded to the Modal volume and
 * synthesizes `text` in that voice.
 */
async function callF5Tts(text: string): Promise<Buffer> {
  if (!F5_TTS_URL) {
    throw new Error('Missing F5_TTS_URL environment variable.');
  }

  const response = await fetch(F5_TTS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(F5_TTS_API_KEY && { Authorization: `Bearer ${F5_TTS_API_KEY}` }),
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `F5-TTS API responded with status ${response.status}: ${body.slice(0, 300)}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates a voice-cloned narration track for the full script text.
 * Returns the audio as a WAV buffer (Modal F5-TTS outputs WAV natively).
 *
 * The `niche` parameter is kept in the signature to preserve the call-site
 * contract in pipeline.ts — F5-TTS uses a single global voice profile,
 * so niche-specific voice selection no longer applies.
 */
export async function generateNarrativeSpeech(
  fullText: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _niche: string
): Promise<{ audioBuffer: Buffer; engine: string }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[AudioEngine] F5-TTS synthesis attempt ${attempt}/${MAX_RETRIES} (${fullText.length} chars)`
      );
      const audioBuffer = await callF5Tts(fullText);
      console.log(`[AudioEngine] F5-TTS success — buffer size: ${audioBuffer.byteLength} bytes`);
      return { audioBuffer, engine: 'f5_tts' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AudioEngine] F5-TTS failure on attempt ${attempt}: ${message}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `[AudioEngine] CRITICAL: F5-TTS failed after ${MAX_RETRIES} attempts. Engine halted.`
        );
      }
      // Exponential backoff
      await new Promise((res) => setTimeout(res, attempt * 3000));
    }
  }

  throw new Error('Unreachable pipeline execution state');
}