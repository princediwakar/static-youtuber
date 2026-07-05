// Path: lib/musicSelector.ts
import { chatCompletion, extractJson } from './deepseek';
import { ACE_STEP_BGM_URL, ACE_STEP_API_KEY } from './constants';

const FETCH_TIMEOUT_MS = 3 * 60 * 1000; 

async function generateWithAceStep(prompt: string, duration: number): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(ACE_STEP_BGM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(ACE_STEP_API_KEY && { Authorization: `Bearer ${ACE_STEP_API_KEY}` }),
      },
      body: JSON.stringify({ prompt, duration, format: 'mp3' }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`ACE-Step responded ${response.status}: ${body.slice(0, 400)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength < 100) {
      throw new Error(`ACE-Step returned suspiciously small audio (${arrayBuffer.byteLength} bytes)`);
    }

    return Buffer.from(arrayBuffer);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`ACE-Step request timed out after ${FETCH_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function selectMusicTrack(
  scriptTitle: string,
  niche: string,
  visualWorld: string,
  narrationText?: string,
): Promise<{ buffer: Buffer; filename: string; title: string }> {
  
  if (!ACE_STEP_BGM_URL || ACE_STEP_BGM_URL.includes('example-modal-url')) {
    throw new Error('CRITICAL: ACE_STEP_BGM_URL is not configured. Pipeline halting.');
  }

  const llmPrompt = `You are composing background music for a YouTube Shorts video.

VIDEO DETAILS:
- Title: "${scriptTitle}"
- Niche: ${niche}
- Visual World: ${visualWorld}
${narrationText ? `\nNARRATION:\n${narrationText}\n` : ''}

Write a detailed music prompt for ACE-Step 1.5 to generate instrumental background music.
The music MUST be purely instrumental — NO vocals, NO singing, NO lyrics.

Consider the emotional arc of the story, appropriate instrumentation for the niche,
tempo, mood, and dynamic changes that follow the narrative.

Output ONLY valid JSON. No markdown.
{ "prompt": "detailed music description for ACE-Step (max 500 chars)", "reason": "one sentence explaining why this fits" }`;

  const raw = await chatCompletion(
    [{ role: 'user', content: llmPrompt }],
    { temperature: 0.4, maxTokens: 400, responseJson: true, timeout: 30_000 },
  );

  const parsed = extractJson(raw) as { prompt: string; reason: string };
  if (!parsed.prompt || parsed.prompt.length < 20) {
    throw new Error('LLM returned an unusable music prompt');
  }

  console.log(`[MusicSelector] ACE-Step prompt generated: ${parsed.prompt.slice(0, 100)}... — ${parsed.reason}`);

  // By the time this is called, the A10G is already hot from the warmup step.
  const buffer = await generateWithAceStep(parsed.prompt, 90);

  return { buffer, filename: 'acestep-bgm.mp3', title: scriptTitle };
}
