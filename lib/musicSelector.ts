// Path: lib/musicSelector.ts
import { readFileSync } from 'fs';
import path from 'path';
import { chatCompletion, extractJson } from './deepseek';

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

export async function selectMusicTrack(
  scriptTitle: string,
  niche: string,
  visualWorld: string,
): Promise<{ buffer: Buffer; filename: string; title: string }> {
  try {
    const prompt = `You are selecting background music for a YouTube Shorts video.

VIDEO DETAILS:
- Title: "${scriptTitle}"
- Niche: ${niche}
- Visual World: ${visualWorld}

AVAILABLE TRACKS:
${JSON.stringify(MUSIC_CATALOG, null, 2)}

Based on the video's niche, title, and visual aesthetic, pick the single best track.
Output ONLY valid JSON. No markdown.
{ "filename": "focus-01.mp3", "reason": "one sentence explaining why this track fits" }`;

    const raw = await chatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.3, maxTokens: 200, responseJson: true, timeout: 30_000 },
    );

    const parsed = extractJson(raw) as { filename: string; reason: string };
    const selected = MUSIC_CATALOG.find(t => t.filename === parsed.filename);
    if (selected) {
      console.log(`[MusicSelector] Selected "${selected.title}" — ${parsed.reason}`);
      const buffer = readFileSync(path.join(MUSIC_DIR, selected.filename));
      return { buffer, filename: selected.filename, title: selected.title };
    }
  } catch (err) {
    console.warn(`[MusicSelector] LLM selection failed, using default:`, (err as Error)?.message);
  }

  // Fallback to default
  const buffer = readFileSync(path.join(MUSIC_DIR, DEFAULT_TRACK));
  return { buffer, filename: DEFAULT_TRACK, title: MUSIC_CATALOG[0].title };
}
