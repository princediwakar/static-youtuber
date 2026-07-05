// Path: lib/musicSelector.ts
import { readFileSync } from 'fs';
import path from 'path';
import { chatCompletion, extractJson } from './deepseek';
import { ACE_STEP_BGM_URL, ACE_STEP_API_KEY } from './constants';

export interface MusicTrack {
  filename: string;
  title: string;
  mood: string[];
  bpm: number;
  energy: number;
  description: string;
}

export const MUSIC_CATALOG: MusicTrack[] = [
  {
    filename: 'focus-01.mp3',
    title: 'Focus',
    mood: ['focused', 'driving'],
    bpm: 120,
    energy: 6,
    description: 'Steady driving pulse with electronic elements, neutral tone suitable for tech and business content',
  },
  {
    filename: 'tension-01.mp3',
    title: 'Tension',
    mood: ['tense', 'ominous', 'dark'],
    bpm: 90,
    energy: 7,
    description: 'Slow-building tension with atmospheric drones, suitable for investigative and crime content',
  },
  {
    filename: 'ambient-01.mp3',
    title: 'Ambient',
    mood: ['contemplative', 'atmospheric', 'philosophical'],
    bpm: 70,
    energy: 3,
    description: 'Spacious ambient pads with subtle movement, suitable for philosophical and reflective content',
  },
];

export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
const DEFAULT_TRACK = 'focus-01.mp3';
const FETCH_TIMEOUT_MS = 3 * 60 * 1000; // 3 min — covers Modal cold start + inference

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

function fallbackToStatic(selectedFilename?: string): { buffer: Buffer; filename: string; title: string } {
  const target = selectedFilename || DEFAULT_TRACK;
  const track = MUSIC_CATALOG.find(t => t.filename === target) || MUSIC_CATALOG[0];
  const buffer = readFileSync(path.join(MUSIC_DIR, track.filename));
  return { buffer, filename: track.filename, title: track.title };
}

export async function selectMusicTrack(
  scriptTitle: string,
  niche: string,
  visualWorld: string,
  narrationText?: string,
): Promise<{ buffer: Buffer; filename: string; title: string }> {
  // If ACE-Step endpoint is not configured, skip straight to static fallback
  if (!ACE_STEP_BGM_URL || ACE_STEP_BGM_URL.includes('example-modal-url')) {
    return fallbackToStatic();
  }

  // Step 1: LLM generates an ACE-Step music prompt from video context
  try {
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

    // Step 2: Generate BGM via ACE-Step on Modal
    const buffer = await generateWithAceStep(parsed.prompt, 90);

    return { buffer, filename: 'acestep-bgm.mp3', title: scriptTitle };
  } catch (err) {
    console.warn(`[MusicSelector] ACE-Step generation failed, falling back to static:`, (err as Error)?.message);
    return fallbackToStatic();
  }
}
