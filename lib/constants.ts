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
  'Stoic Philosophy': 17,  //  1 PM EST — self-improvement, indexed by afternoon reflection window
  'Urban Survival': 19,  //  3 PM EST — broad US male audience, indexed by evening peak
  'SaaS & AI Tools': 21,  //  5 PM EST — tech audience scrolls after work / pre-dinner
};

// ─── Format templates ───────────────────────────────────────────────────────────
export const FORMAT_TEMPLATES = ['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST'] as const;
export type FormatTemplate = typeof FORMAT_TEMPLATES[number];

export const FORMAT_TEMPLATE_WEIGHTS: Record<string, Record<FormatTemplate, number>> = {
  'SaaS & AI Tools': { RAPID_FIRE: 0.1, SLOW_BURN: 0.7, THE_LIST: 0.2 },
  'Financial Forensics': { RAPID_FIRE: 0.8, SLOW_BURN: 0.2, THE_LIST: 0 },
  'Stoic Philosophy': { RAPID_FIRE: 0, SLOW_BURN: 0.7, THE_LIST: 0.3 },
  'Urban Survival': { RAPID_FIRE: 0, SLOW_BURN: 0.6, THE_LIST: 0.4 },
};

export const TEMPLATE_SHOT_COUNTS: Record<FormatTemplate, { min: number; max: number }> = {
  RAPID_FIRE: { min: 15, max: 18 },
  SLOW_BURN: { min: 12, max: 12 },
  THE_LIST: { min: 15, max: 15 },
};

// ─── Model config ─────────────────────────────────────────────────────────────
export const DEEPSEEK_TEXT_MODEL = process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-v4-pro'; // deepseek-chat deprecated 2026-07-24
export const CF_AI_IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
export const CF_AI_SLIDE_WIDTH = 768;
export const CF_AI_SLIDE_HEIGHT = 1344;
// F5-TTS Modal endpoint (voice cloning)
export const F5_TTS_URL = process.env.F5_TTS_URL || '';
export const F5_TTS_API_KEY = process.env.F5_TTS_API_KEY || '';

// ACE-Step BGM Modal endpoint (instrumental music generation)
export const ACE_STEP_BGM_URL = process.env.ACE_STEP_BGM_URL || '';
export const ACE_STEP_API_KEY = process.env.ACE_STEP_API_KEY || '';
// Separate endpoint for warmup. Modal fastapi_endpoint creates a unique domain
// per method, so appending /warmup to the BGM URL won't work.
// Falls back to deriving from ACE_STEP_BGM_URL by replacing the method slug.
export const ACE_STEP_WARMUP_URL = process.env.ACE_STEP_WARMUP_URL ||
  (ACE_STEP_BGM_URL ? ACE_STEP_BGM_URL.replace('-generate-bgm', '-warmup') : '');

// ─── Music ─────────────────────────────────────────────────────────────────────
export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
export const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';

export const FORMATS = FORMAT_TEMPLATES; // alias for backward compatibility

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
export const CAPTION_MAX_CHARS_PER_LINE = 32;
export const CAPTION_MAX_CHARS = 80;
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
    aestheticId: 'tech-minimalist',
    toneInstruction: `You are a master storyteller chronicling the raw human drama behind billion-dollar startups.
Every story is about a real person who made a single bet that paid off — or nearly destroyed them.
Paint the founder as a character: Where did they come from? What was their obsession?
What was the moment everything hinged on one decision?

Ground every story in concrete reality. Name exact dates, dollar amounts, and pivotal moments.
Build tension through the stakes: how close they came to failure, the competitor they beat,
the investor who said no. End with the outcome — the valuation, the exit, the lesson.

NEVER use words like "disrupt", "innovate", or "unicorn".
NEVER sound like a cheerleader. Let the facts tell the story.
Every shot must advance the narrative, not just list features.`,
    minQualityScore: 7,
  },
  'Financial Forensics': {
    aestheticId: 'finance-editorial',
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
    aestheticId: 'stoic-zen',
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
    aestheticId: 'survival-technical',
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
  aestheticId: 'tech-minimalist',
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
  'tech-minimalist': {
    id: 'tech-minimalist',
    instruction: 'Describe a pristine, abstract UI/UX concept. Think Apple product reveal, Dribbble minimalism, and clean geometry.',
    imagePrefix: 'A hyper-minimalist, high-end 3D abstract geometric render. Soft, diffused daylight, frosted glassmorphism, pristine pastel gradients, and flawlessly smooth surfaces. Massive empty space. Absolutely devoid of any text, letters, or typography. ',
    thumbnailPrefix: 'An ultra-clean, asymmetrical 3D abstract glassmorphism render. Flawless Apple-style minimalism with soft lighting and a massive, pristine negative space on the left. No text. ',
  },
  'finance-editorial': {
    id: 'finance-editorial',
    instruction: 'Describe a clean, sophisticated data concept. Think Wall Street Journal editorial illustration or Google Material design.',
    imagePrefix: 'A crisp, minimalist isometric paper-craft illustration. Clean architectural lines, calm morning lighting, subtle drop shadows, and abstract data visualization shapes. Sophisticated color palette. Deep negative space. Completely devoid of text. ',
    thumbnailPrefix: 'A striking, minimalist isometric infographic illustration. Clean lines, soft editorial lighting, and an asymmetrical composition leaving a massive, blank void for overlay. Absolutely no text. ',
  },
  'stoic-zen': {
    id: 'stoic-zen',
    instruction: 'Describe a concept using perfect balance and flow. Think 3Blue1Brown elegance, Japanese calligraphy, and absolute tranquility.',
    imagePrefix: 'An elegant, minimalist sumi-e ink wash painting on pristine white paper. A single fluid, abstract brushstroke, perfectly balanced geometry, bathed in calm morning light. Absolute absence of text, symbols, or characters. ',
    thumbnailPrefix: 'A minimalist, high-contrast abstract sumi-e ink sweep. Pristine white negative space dominating the frame, perfectly balanced and serene. Asymmetrical design. No text, characters, or symbols. ',
  },
  'survival-technical': {
    id: 'survival-technical',
    instruction: 'Describe a clean, technical blueprint. Think Dieter Rams / Braun industrial design, wireframes, and clinical precision.',
    imagePrefix: 'A crisp, high-contrast minimalist technical wireframe illustration. Clean vector lines, subtle grid background, stark industrial design layout, and clinical lighting. Uncluttered and precise. Completely empty space for overlay. No text, no labels. ',
    thumbnailPrefix: 'A bold, minimalist technical blueprint illustration. Stark contrast, clean vector lines on a subtle grid, aggressively asymmetrical to leave a massive blank area. Zero text, numbers, or labels. ',
  },
};

export const QUALITY_GATE_MAX_RETRIES = 4;
