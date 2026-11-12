// Path: lib/musicSelector.ts
import { getAceStepBgmUrl, ACE_STEP_API_KEY } from './constants';
import type { FormatTemplate } from './constants';

const FETCH_TIMEOUT_MS = 8 * 60 * 1000; // 8 min — covers 300s long-form audio; shorts never exceeds 60s

const NICHE_MUSIC_PROMPTS: Record<string, Partial<Record<FormatTemplate, string[]>>> = {
  'Anti-Status Wealth': {
    RAPID_FIRE: [
      'dark synthwave, driving sub-bass, tense, aggressive, cynical, corporate thriller, 105bpm',
      'minimalist electronic, cold analog synths, ticking clock percussion, ruthless, 100bpm',
    ],
    SLOW_BURN: [
      'dark ambient drone, sparse piano, ominous, investigative, cold and precise, 75bpm',
    ],
    THE_LIST: [
      'driving synth bass, tense arpeggios, building intensity, aggressive, cynical, 100bpm',
    ],
  },
  'Weaponized History': {
    RAPID_FIRE: [
      'heavy industrial percussion, dark orchestral stabs, aggressive, cinematic, terrifying, 110bpm',
      'driving war drums, low brass swells, intense, unrelenting, apocalyptic, 105bpm',
    ],
    SLOW_BURN: [
      'dark cinematic ambient, low drones, distant thunder, eerie, foreboding, slow build, 70bpm',
    ],
    THE_LIST: [
      'cinematic tension, heavy strings, urgent percussion, aggressive, epic, 95bpm',
    ],
  },
  'Behavioral Friction': {
    RAPID_FIRE: [
      'industrial techno, distorted bass, aggressive, relentless, psychological tension, 115bpm',
      'dark electronic, frantic arpeggio, intense, driving beat, uncomfortable, 110bpm',
    ],
    SLOW_BURN: [
      'eerie ambient, high pitched drone, sparse metallic hits, psychological horror, 65bpm',
    ],
    THE_LIST: [
      'tense electronic, driving mechanical rhythm, aggressive, biological, urgent, 105bpm',
    ],
  },
  'System Reverse-Engineering': {
    RAPID_FIRE: [
      'frantic electronic, glitchy percussion, tense, paranoid, driving, cyberpunk, 120bpm',
      'fast synth sequence, intense bass pulse, hacking, urgent, aggressive, 115bpm',
    ],
    SLOW_BURN: [
      'paranoid ambient, subtle digital glitches, low hum, investigative, eerie, 75bpm',
    ],
    THE_LIST: [
      'driving cybernetic rhythm, aggressive synth, tense, methodical, exposing, 105bpm',
    ],
  },
};

const GENERIC_PROMPTS: string[] = [
  'ambient electronic, atmospheric pads, subtle rhythm, cinematic, neutral mood, 80bpm',
  'cinematic ambient, soft strings, gentle percussion, broad appeal, balanced, 85bpm',
];

function pickMusicPrompt(niche: string, formatTemplate: FormatTemplate, title: string, visualWorld: string, narrationText: string): string {
  const nicheMap = NICHE_MUSIC_PROMPTS[niche];
  const prompts = nicheMap?.[formatTemplate] ?? GENERIC_PROMPTS;
  const base = prompts[Math.floor(Math.random() * prompts.length)];
  const narrationSnippet = narrationText.split(/\s+/).slice(0, 20).join(' ');
  const fullPrompt = `${base} — underscore: ${title}, visual style: ${visualWorld}, feeling: ${narrationSnippet}`;
  return fullPrompt.length > 950 ? fullPrompt.slice(0, 950) + '...' : fullPrompt;
}

async function generateWithAceStep(prompt: string, duration: number): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const aceStepBgmUrl = getAceStepBgmUrl();
    const response = await fetch(aceStepBgmUrl, {
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

import fs from 'fs';
import path from 'path';

function getFallbackMusic(formatTemplate: FormatTemplate): Buffer {
  const assetsDir = path.join(process.cwd(), 'assets', 'music');
  let filename = 'tension-01.mp3';
  if (formatTemplate === 'SLOW_BURN') {
    filename = 'ambient-01.mp3';
  } else if (formatTemplate === 'THE_LIST') {
    filename = 'focus-01.mp3';
  }
  const fullPath = path.join(assetsDir, filename);
  if (fs.existsSync(fullPath)) {
    console.log(`[MusicSelector] Loaded bundled fallback BGM: ${filename}`);
    return fs.readFileSync(fullPath);
  }
  // Try any .mp3 in directory
  const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.mp3'));
  if (files.length > 0) {
    return fs.readFileSync(path.join(assetsDir, files[0]));
  }
  throw new Error('[MusicSelector] No BGM audio available');
}

export async function selectMusicTrack(
  scriptTitle: string,
  niche: string,
  formatTemplate: FormatTemplate,
  visualWorld: string,
  narrationText: string,
  durationSeconds: number,
): Promise<{ buffer: Buffer; filename: string; title: string }> {
  const aceStepBgmUrl = getAceStepBgmUrl();
  const prompt = pickMusicPrompt(niche, formatTemplate, scriptTitle, visualWorld, narrationText);
  const duration = Math.max(30, Math.min(durationSeconds, 300));

  if (aceStepBgmUrl && !aceStepBgmUrl.includes('example-modal-url')) {
    try {
      console.log(`[MusicSelector] ${niche}/${formatTemplate} → ${duration}s ACE-Step BGM: "${prompt.slice(0, 100)}..."`);
      const buffer = await generateWithAceStep(prompt, duration);
      return { buffer, filename: 'acestep-bgm.mp3', title: scriptTitle };
    } catch (err: any) {
      console.warn(`[MusicSelector] ACE-Step generation failed (${err.message}). Falling back to bundled CC-BY track.`);
    }
  } else {
    console.warn(`[MusicSelector] ACE_STEP_BGM_URL not configured. Using bundled CC-BY track.`);
  }

  const fallbackBuffer = getFallbackMusic(formatTemplate);
  return { buffer: fallbackBuffer, filename: 'fallback-bgm.mp3', title: scriptTitle };
}
