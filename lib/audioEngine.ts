// Path: lib/audioEngine.ts
import { getF5TtsUrl, F5_TTS_API_KEY } from './constants';

const MAX_RETRIES = 3;

// F5-TTS on Modal: GPU cold start (~30s) + synthesis of a short chunk (~2s).
// Give it 60 seconds before treating the request as hung.
const FETCH_TIMEOUT_MS = 60 * 1000;

/**
 * Single attempt: POST to F5-TTS Modal endpoint, return WAV buffer.
 * Each call creates a fresh AbortController so retries get full timeout.
 */
async function callF5Tts(text: string, voiceName: string): Promise<Buffer> {
  const f5TtsUrl = getF5TtsUrl();
  if (!f5TtsUrl) {
    throw new Error('[AudioEngine] Missing F5_TTS_URL environment variable.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(f5TtsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(F5_TTS_API_KEY && { Authorization: `Bearer ${F5_TTS_API_KEY}` }),
      },
      body: JSON.stringify({ text, voice: voiceName }),
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

export function concatWavs(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) throw new Error('No buffers provided');
  if (buffers.length === 1) return buffers[0];

  const parsed = buffers.map((buf, i) => {
    let offset = 12;
    let dataOffset = 0;
    let dataSize = 0;
    while (offset + 8 <= buf.length) {
      const chunkId = buf.toString('ascii', offset, offset + 4);
      const chunkSize = buf.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        dataOffset = offset + 8;
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize;
    }
    if (!dataOffset) throw new Error(`Missing data chunk in WAV at index ${i}`);
    return { buf, dataOffset, dataSize };
  });

  const totalDataSize = parsed.reduce((sum, p) => sum + p.dataSize, 0);
  const first = parsed[0];
  
  const newHeader = Buffer.alloc(first.dataOffset);
  first.buf.copy(newHeader, 0, 0, first.dataOffset);
  
  newHeader.writeUInt32LE(first.dataOffset - 8 + totalDataSize, 4);
  newHeader.writeUInt32LE(totalDataSize, first.dataOffset - 4);
  
  const dataChunks = parsed.map(p => p.buf.subarray(p.dataOffset, p.dataOffset + p.dataSize));
  return Buffer.concat([newHeader, ...dataChunks]);
}

function getWavDuration(buffer: Buffer): number {
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === 'fmt ') {
      channels = buffer.readUInt16LE(offset + 8);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bitsPerSample = buffer.readUInt16LE(offset + 22);
    } else if (chunkId === 'data') {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }

  if (!sampleRate || !dataSize) throw new Error('Invalid WAV — missing fmt or data chunk');
  return dataSize / (sampleRate * channels * (bitsPerSample / 8));
}

/**
 * Generates a voice-cloned narration track for a single shot's text.
 * Returns the audio as a WAV buffer (F5-TTS Modal endpoint outputs WAV).
 */
export async function generateShotSpeech(
  shotText: string,
  voiceName: string,
  shotIndex: number
): Promise<{ audioBuffer: Buffer; engine: string; durationMs: number }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[AudioEngine] Shot ${shotIndex} F5-TTS attempt ${attempt}/${MAX_RETRIES} — ${shotText.length} chars with voice '${voiceName}'`
      );
      const audioBuffer = await callF5Tts(shotText, voiceName);
      const durationMs = Math.round(getWavDuration(audioBuffer) * 1000);
      console.log(
        `[AudioEngine] Shot ${shotIndex} F5-TTS success — ${audioBuffer.byteLength.toLocaleString()} bytes, ${durationMs}ms`
      );
      return { audioBuffer, engine: 'f5_tts', durationMs };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[AudioEngine] Shot ${shotIndex} attempt ${attempt} failed: ${message}`);
      if (attempt === MAX_RETRIES) {
        throw new Error(
          `[AudioEngine] CRITICAL: F5-TTS shot ${shotIndex} failed after ${MAX_RETRIES} attempts. Last error: ${message}`
        );
      }
      const backoffMs = attempt * 5_000;
      console.log(`[AudioEngine] Shot ${shotIndex} retrying in ${backoffMs / 1000}s...`);
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }

  throw new Error(`[AudioEngine] Unreachable pipeline execution state for shot ${shotIndex}`);
}

/**
 * Generates a voice-cloned narration track for the full script text.
 * Returns the audio as a WAV buffer (F5-TTS Modal endpoint outputs WAV).
 *
 * @deprecated Use generateShotSpeech for per-shot TTS to avoid F5-TTS hallucination bleed.
 */
export async function generateNarrativeSpeech(
  fullText: string,
  voiceName: string
): Promise<{ audioBuffer: Buffer; engine: string; durationMs: number }> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[AudioEngine] F5-TTS attempt ${attempt}/${MAX_RETRIES} — ${fullText.length} chars with voice '${voiceName}'`
      );
      const audioBuffer = await callF5Tts(fullText, voiceName);
      const durationMs = Math.round(getWavDuration(audioBuffer) * 1000);
      console.log(
        `[AudioEngine] F5-TTS success — ${audioBuffer.byteLength.toLocaleString()} bytes, ${durationMs}ms`
      );
      return { audioBuffer, engine: 'f5_tts', durationMs };
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