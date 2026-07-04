// Path: lib/edgeTts.ts
import { EDGE_TTS_URL, EDGE_TTS_API_KEY } from './constants';

export async function callEdgeTts(text: string, voice: string): Promise<Buffer> {
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
    throw new Error(`EdgeTTS error ${res.status}: ${errorText.slice(0, 500)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
