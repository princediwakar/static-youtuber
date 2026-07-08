// Path: lib/musicSelector.ts
import { ACE_STEP_BGM_URL, ACE_STEP_API_KEY } from './constants';
import type { FormatTemplate } from './constants';

const FETCH_TIMEOUT_MS = 8 * 60 * 1000; // 8 min — covers 300s long-form audio; shorts never exceeds 60s

const NICHE_MUSIC_PROMPTS: Record<string, Partial<Record<FormatTemplate, string[]>>> = {
  'Financial Forensics': {
    RAPID_FIRE: [
      'dark ambient, pulsing synth bass, investigative, sparse piano, tense, 85bpm, cinematic',
      'electronic thriller, low drone, ticking clock percussion, corporate espionage, brooding',
      'minimalist electronic, cold analog synths, slow build, mysterious, dark, 90bpm',
    ],
    SLOW_BURN: [
      'dark ambient, brooding cello, slow atmospheric pads, tension building, mysterious, 70bpm',
      'cinematic drone, sparse piano, low strings, investigative, melancholy, 65bpm',
    ],
    THE_LIST: [
      'dark synth, pulsing arpeggio, tense, investigative, building intensity, 95bpm',
      'electronic, driving bassline, urgent, mysterious, minimalist percussion, 100bpm',
    ],
    DEEP_DIVE: [
      'dark ambient documentary score, slow evolving strings, tense piano motif, investigative, cinematic build, 65bpm',
      'minimal orchestral, brooding cello ostinato, sparse brass swells, cold and precise, 60bpm',
    ],
  },
  'Stoic Philosophy': {
    RAPID_FIRE: [
      'epic orchestral, soaring strings, motivational brass, steady percussion, inspiring, 90bpm',
      'cinematic, building crescendo, heroic horns, determined, triumphant, 95bpm',
    ],
    SLOW_BURN: [
      'ambient, deep pads, slow strings, contemplative, meditative, minimal piano, 60bpm',
      'neoclassical, solo cello, sparse, introspective, melancholic, warm, 55bpm',
    ],
    THE_LIST: [
      'orchestral, steady build, strings and brass, contemplative yet powerful, 80bpm',
      'cinematic, gradual crescendo, emotional strings, reflective, resolute, 75bpm',
    ],
    DEEP_DIVE: [
      'neoclassical ambient, solo cello, slow evolving string pads, contemplative, meditative depth, 55bpm',
      'cinematic orchestral, gradual crescendo, emotional but restrained, ancient and timeless, 60bpm',
    ],
  },
  'Urban Survival': {
    RAPID_FIRE: [
      'industrial, aggressive percussion, dark synth, urgent, tactical, high tension, 100bpm',
      'electronic, driving beat, pulsing bass, alert, gritty, intense, 105bpm',
    ],
    SLOW_BURN: [
      'dark ambient, low drones, distant thunder, eerie, suspenseful, slow build, 65bpm',
      'cinematic tension, sub-bass rumble, sparse percussion, ominous, foreboding, 70bpm',
    ],
    THE_LIST: [
      'industrial, mechanical rhythm, dark electronic, urgent, tactical, 95bpm',
      'aggressive synth, heavy percussion, tense, driving, apocalyptic, 100bpm',
    ],
    DEEP_DIVE: [
      'dark cinematic, low drones with distant percussion, tactical, methodical build, foreboding, 60bpm',
      'ambient industrial, slow sub-bass pulse, sparse metallic percussion, ominous, deliberate, 65bpm',
    ],
  },
  'SaaS & AI Tools': {
    RAPID_FIRE: [
      'electronic, upbeat synth, driving beat, optimistic, energetic, modern, 100bpm',
      'synthwave, bright arpeggios, motivational, tech-forward, sleek, 95bpm',
    ],
    SLOW_BURN: [
      'ambient electronic, soft pads, minimal beat, hopeful, reflective, inspiring, 70bpm',
      'lo-fi, warm piano, gentle beat, contemplative, optimistic, cozy, 75bpm',
    ],
    THE_LIST: [
      'synthwave, driving bassline, optimistic, retro-future, energetic, modern, 95bpm',
      'electronic, pulsing rhythm, bright, innovative, sleek, motivational, 90bpm',
    ],
    DEEP_DIVE: [
      'ambient electronic documentary score, soft evolving pads, minimal beat, hopeful and reflective, 65bpm',
      'lo-fi cinematic, warm piano, gentle atmospheric synth, contemplative, optimistic depth, 60bpm',
    ],
  },
};

const GENERIC_PROMPTS: string[] = [
  'ambient electronic, atmospheric pads, subtle rhythm, cinematic, neutral mood, 80bpm',
  'cinematic ambient, soft strings, gentle percussion, broad appeal, balanced, 85bpm',
];

function pickMusicPrompt(niche: string, formatTemplate: FormatTemplate, title: string): string {
  const nicheMap = NICHE_MUSIC_PROMPTS[niche];
  const prompts = nicheMap?.[formatTemplate] ?? GENERIC_PROMPTS;
  const base = prompts[Math.floor(Math.random() * prompts.length)];
  return `${base} — underscore: ${title}`;
}

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
  formatTemplate: FormatTemplate,
  durationSeconds: number,
): Promise<{ buffer: Buffer; filename: string; title: string }> {
  
  if (!ACE_STEP_BGM_URL || ACE_STEP_BGM_URL.includes('example-modal-url')) {
    throw new Error('CRITICAL: ACE_STEP_BGM_URL is not configured. Pipeline halting.');
  }

  const prompt = pickMusicPrompt(niche, formatTemplate, scriptTitle);
  // For shorts, narrationDurationSec is already ≤60s in practice.
  // For long-form, it can be up to 300s — no artificial cap.
  const duration = Math.max(30, Math.min(durationSeconds, 300));

  console.log(`[MusicSelector] ${niche}/${formatTemplate} → ${duration}s BGM: "${prompt.slice(0, 100)}..."`);

  const buffer = await generateWithAceStep(prompt, duration);

  return { buffer, filename: 'acestep-bgm.mp3', title: scriptTitle };
}
