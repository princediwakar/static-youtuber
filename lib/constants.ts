// lib/constants.ts
import path from 'path';

export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'tech_shots';

export const NICHES = ['SaaS & AI Tools', 'Financial Forensics', 'Stoic Philosophy', 'Urban Survival'];

// One niche per channel — deterministic, no random selection
export const ACCOUNT_NICHE: Record<string, string> = {
  tech_shots: 'SaaS & AI Tools',
  finance_shots: 'Financial Forensics',
  stoic_shots: 'Stoic Philosophy',
  survival_shots: 'Urban Survival',
};

// Immutable YouTube channel IDs — handles can be renamed, these never change
export const ACCOUNT_YOUTUBE_CHANNEL_ID: Record<string, string> = {
  tech_shots: 'UCYJQqqRf4tMxc7ra5FF08eQ',
  finance_shots: 'UCzKvcGH7IyS684PQ4aCw2PQ',
  survival_shots: 'UC6gH91v6aGmQFdNwMFC5RwQ',
  stoic_shots: 'UCnBL50AkM_6BmvrNlS1rxVw',
};

// Optimal publish hour per niche (UTC).
// Staggered across the US daytime window so each channel hits a different
// sweet spot: videos are indexed by the algorithm 2-3 hours before peak
// evening viewing (7-10 PM local) and no two pipelines contend for resources.
export const NICHE_PUBLISH_HOUR_UTC: Record<string, number> = {
  'Financial Forensics': 15,  // 11 AM EST — finance audience peaks midday + lunch scroll
  'Stoic Philosophy':    17,  //  1 PM EST — self-improvement, indexed by afternoon reflection window
  'Urban Survival':      19,  //  3 PM EST — broad US male audience, indexed by evening peak
  'SaaS & AI Tools':     21,  //  5 PM EST — tech audience scrolls after work / pre-dinner
};

// ─── Format templates ───────────────────────────────────────────────────────────
export const FORMAT_TEMPLATES = ['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST'] as const;
export type FormatTemplate = typeof FORMAT_TEMPLATES[number];

export const FORMAT_TEMPLATE_WEIGHTS: Record<string, Record<FormatTemplate, number>> = {
  'SaaS & AI Tools':       { RAPID_FIRE: 0.8, SLOW_BURN: 0,   THE_LIST: 0.2 },
  'Financial Forensics':   { RAPID_FIRE: 0.8, SLOW_BURN: 0.2, THE_LIST: 0   },
  'Stoic Philosophy':      { RAPID_FIRE: 0,   SLOW_BURN: 0.7, THE_LIST: 0.3 },
  'Urban Survival':        { RAPID_FIRE: 0,   SLOW_BURN: 0.6, THE_LIST: 0.4 },
};

export const TEMPLATE_SHOT_COUNTS: Record<FormatTemplate, { min: number; max: number }> = {
  RAPID_FIRE: { min: 15, max: 18 },
  SLOW_BURN:  { min: 12, max: 12 },
  THE_LIST:   { min: 15, max: 15 },
};

// ─── Model config ─────────────────────────────────────────────────────────────
export const DEEPSEEK_TEXT_MODEL = process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-v4-pro'; // deepseek-chat deprecated 2026-07-24
export const CF_AI_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const CF_AI_SLIDE_WIDTH = 768;
export const CF_AI_SLIDE_HEIGHT = 1344;
export const EDGE_TTS_URL = process.env.EDGE_TTS_URL || 'http://localhost:5050';
export const EDGE_TTS_API_KEY = process.env.EDGE_TTS_API_KEY || 'your_api_key_here';

export type TTSVoiceProfile = {
  fallbackVoice: string;
  directorNotes: string;
};

export const TTS_VOICE_PROFILES: Record<string, TTSVoiceProfile> = {
  'SaaS & AI Tools': {
    fallbackVoice: 'en-US-AvaNeural',
    directorNotes: 'Crisp pacing, clean software tool explanation rhythm.',
  },
  'Financial Forensics': {
    fallbackVoice: 'en-US-BrianNeural',
    directorNotes: 'Grave tone, cinematic scale framing.',
  },
  'Stoic Philosophy': {
    fallbackVoice: 'en-US-BrianNeural',
    directorNotes: 'Deep, measured, and resonant.',
  },
  'Urban Survival': {
    fallbackVoice: 'en-US-BrianNeural',
    directorNotes: 'Urgent but controlled, authoritative.',
  },
};

// ─── Music ─────────────────────────────────────────────────────────────────────
export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
export const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';

export const FORMATS = FORMAT_TEMPLATES; // alias for backward compatibility

export const DEFAULT_TTS_VOICE_PROFILE: TTSVoiceProfile = {
  fallbackVoice: 'en-US-AvaNeural',
  directorNotes: 'Style: Crisp, authoritative narrator. Tension from facts, not voice. Pacing: Brisk but measured.',
};

export const MODAL_RENDER_URL = process.env.MODAL_RENDER_URL || 'https://example-modal-url.com/render';

export const FFMPEG_CRF = '23';
export const FFMPEG_PRESET = 'medium';
export const FFMPEG_AUDIO_BITRATE = '128k';
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;

export const ZOOMPAN_ZOOM_IN_START = 1.0;
export const ZOOMPAN_ZOOM_IN_END = 1.12;
export const ZOOMPAN_ZOOM_OUT_START = 1.12;
export const ZOOMPAN_ZOOM_OUT_END = 1.0;
export const ZOOMPAN_SPEED = 0.0006;

export const MUSIC_VOLUME = 0.35;

// ─── Caption rendering ────────────────────────────────────────────────────────
export const CAPTION_FONT_SIZE = 72;
export const CAPTION_MAX_CHARS_PER_LINE = 26;
export const CAPTION_MAX_CHARS = 80;
export const CAPTION_Y_POSITION = 0.65;
export const CAPTION_LINE_HEIGHT = 84;
export const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'Montserrat-Bold.ttf');

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;
export const CLOUDINARY_FOLDER = 'ai-slideshow';
export const CLOUDINARY_EXPIRE_DAYS = 7;

// ─── Niche profiles ───────────────────────────────────────────────────────────
export type NicheProfile = {
  aestheticId: string;
  toneInstruction: string;
  minQualityScore: number;
};

export const NICHE_PROFILES: Record<string, NicheProfile> = {
  'SaaS & AI Tools': {
    aestheticId: 'vector',
    toneInstruction: `Your tone is crisp, confident, and instructive — like a top-tier tech YouTuber
explaining how a specific tool solves a specific business problem. Zero fluff.
Name the exact software, the exact workflow, and the exact outcome. Build value
through specificity: what does the tool replace, how much time/money does it save,
what's the concrete before-and-after.

NEVER use words like "revolutionary", "game-changing", or "insane".
NEVER sound like a sales pitch. Let the utility do the persuasion.
Every shot must convey one actionable piece of information.`,
    minQualityScore: 6,
  },
  'Financial Forensics': {
    aestheticId: 'dossier',
    toneInstruction: `Your tone is grave, investigative, and forensically precise — like the journalist
who broke the Enron or FTX story. The numbers are damning. The psychology of the
people involved is fascinating. Build tension through the scale of the money and
the specificity of the decisions that led to collapse.

Use exact dollar amounts, dates, and names. Detail the pivotal meeting, the
fateful email, or the single decision that made everything unravel.
NEVER use "mind-blowing" or "insane". Let the facts indict.`,
    minQualityScore: 6,
  },
  'Stoic Philosophy': {
    aestheticId: 'dark-cinematic',
    toneInstruction: `Your tone is deep, measured, and unflinching — like a philosopher-warrior
who has endured immense hardship and emerged with clarity. Speak like Marcus
Aurelius addressing himself in his journal. Every word is chosen. Every sentence
lands with weight.

Use the language of discipline, endurance, and inner sovereignty. Contrast
what the weak man does vs. what the disciplined man does. Reference ancient
Stoic principles but apply them to modern struggles: career, relationships,
self-mastery.

NEVER sound motivational in the Instagram-quote sense. No cheerleading.
This is cold, hard, earned wisdom — not inspiration.`,
    minQualityScore: 6,
  },
  'Urban Survival': {
    aestheticId: 'tactical',
    toneInstruction: `Your tone is urgent, precise, and operational — like a special forces instructor
briefing a team before a mission. The scenarios are real. The stakes are life and
death. Every specification matters. Build tension through the plausibility of the
scenario and the specific, actionable steps the viewer needs to survive it.

Name exact gear, exact specs, exact timeframes. "A regional blackout isn't
theoretical — here's exactly what fails in the first 10 minutes."
NEVER sound alarmist or conspiratorial. Be the calm, competent voice of
preparedness in a chaotic world.`,
    minQualityScore: 6,
  },
};

export const DEFAULT_NICHE_PROFILE: NicheProfile = {
  aestheticId: 'vector',
  toneInstruction: `Your tone is crisp, authoritative, and informative. Build value through
specific facts and actionable insights, not theatrical emphasis.`,
  minQualityScore: 5,
};

export type Aesthetic = {
  id: string;
  instruction: string;
  imagePrefix: string;
  thumbnailPrefix: string;
};

// FLUX.1 [schnell] optimized image prefixes.
// Replaced flat vectors with textured, cinematic, fine-art styling.
export const AESTHETICS: Record<string, Aesthetic> = {
  dossier: {
    id: 'dossier',
    instruction: 'Write a highly descriptive paragraph. Treat the image as a dark, high-contrast monochrome archival painting.',
    imagePrefix: 'A dark, atmospheric, high-contrast black and white fine art painting with visible canvas textures and raw, expressive brushstrokes. Deep charcoal shadows and stark volumetric highlights. Completely devoid of text. ',
    thumbnailPrefix: 'A dark, high-contrast black and white fine art painting with raw brushstrokes. Empty dark space for overlay. No text. ',
  },
  vector: {
    id: 'vector',
    instruction: 'Write a highly descriptive paragraph. Treat the image as a dark, textured, cinematic oil painting.',
    imagePrefix: 'A dark, atmospheric, high-contrast fine art oil painting with visible canvas textures and raw, expressive brushstrokes. Muted, desaturated cinematic color grading, heavy shadows. Entirely devoid of text. ',
    thumbnailPrefix: 'A dark, cinematic fine art oil painting with raw brushstrokes and muted colors. Asymmetrical, massive empty negative space. No text. ',
  },
  'dark-cinematic': {
    id: 'dark-cinematic',
    instruction: 'Write a highly descriptive paragraph. Treat the image as a brooding, epic masterpiece painting.',
    imagePrefix: 'A dark, moody cinematic oil painting utilizing dramatic chiaroscuro lighting. Deep desaturated blacks, rich oil textures, and an epic, solitary atmosphere. Completely free of text. ',
    thumbnailPrefix: 'A dark, moody cinematic oil painting with dramatic lighting and deep shadows. Massive empty dark space. No text. ',
  },
  tactical: {
    id: 'tactical',
    instruction: 'Write a highly descriptive paragraph. Treat the image as a gritty, hyper-realistic combat painting.',
    imagePrefix: 'A gritty, heavily textured fine art painting shot with a shallow depth of field. Matte black surfaces, dramatic practical lighting, and a moody, atmospheric haze. Contains no text. ',
    thumbnailPrefix: 'A gritty, atmospheric combat painting with dramatic moody lighting. Stark negative space. Absolutely no text. ',
  },
};

export const QUALITY_GATE_MAX_RETRIES = 2;
