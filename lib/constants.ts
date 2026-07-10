// lib/constants.ts
import path from 'path';

export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'canvas_center';

export const NICHES = ['Anti-Status Wealth', 'Weaponized History', 'Behavioral Friction', 'System Reverse-Engineering'];

// One niche per channel — deterministic, no random selection
export const ACCOUNT_NICHE: Record<string, string> = {
  canvas_center: 'Anti-Status Wealth',
  canvas_area: 'Weaponized History',
  canvas_station: 'Behavioral Friction',
  canvas_base: 'System Reverse-Engineering',
};

// Immutable YouTube channel IDs — handles can be renamed, these never change
export const ACCOUNT_YOUTUBE_CHANNEL_ID: Record<string, string> = {
  canvas_center: 'UCYJQqqRf4tMxc7ra5FF08eQ',
  canvas_area: 'UCzKvcGH7IyS684PQ4aCw2PQ',
  canvas_base: 'UC6gH91v6aGmQFdNwMFC5RwQ',
  canvas_station: 'UCnBL50AkM_6BmvrNlS1rxVw',
};


// ─── Format templates ───────────────────────────────────────────────────────────
export const FORMAT_TEMPLATES = ['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST', 'DEEP_DIVE'] as const;
export type FormatTemplate = typeof FORMAT_TEMPLATES[number];

export const FORMAT_TEMPLATE_WEIGHTS: Record<string, Record<FormatTemplate, number>> = {
  'Anti-Status Wealth':         { RAPID_FIRE: 0.7, SLOW_BURN: 0,   THE_LIST: 0.3, DEEP_DIVE: 0 },
  'Weaponized History':         { RAPID_FIRE: 0.6, SLOW_BURN: 0.4, THE_LIST: 0,   DEEP_DIVE: 0 },
  'Behavioral Friction':        { RAPID_FIRE: 0.8, SLOW_BURN: 0,   THE_LIST: 0.2, DEEP_DIVE: 0 },
  'System Reverse-Engineering': { RAPID_FIRE: 0.9, SLOW_BURN: 0,   THE_LIST: 0.1, DEEP_DIVE: 0 },
};

export const TEMPLATE_SHOT_COUNTS: Record<FormatTemplate, { min: number; max: number }> = {
  RAPID_FIRE: { min: 15, max: 25 },
  SLOW_BURN:  { min: 12, max: 18 },
  THE_LIST:   { min: 12, max: 20 },
  DEEP_DIVE:  { min: 30, max: 60 }, // long-form only — never selected by shorts bandit
};

// LLM config (Modal vLLM endpoint)
export const MODAL_LLM_URL = process.env.MODAL_LLM_URL || 'https://princediwakar25--llm-server-fastapi-app.modal.run';

// FLUX.1 [schnell] — fast + cheap.
export const CF_AI_IMAGE_MODEL = process.env.CF_AI_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
export const CF_AI_IMAGE_STEPS = Number(process.env.CF_AI_IMAGE_STEPS) || 8; // hard cap for flux-1-schnell

// Optional upgrade path: FLUX.2 [dev] (@cf/black-forest-labs/flux-2-dev) is
// Black Forest Labs' larger, non-distilled model 
//   CF_AI_IMAGE_MODEL=@cf/black-forest-labs/flux-2-dev
export const CF_AI_IMAGE_STEPS_FLUX2 = Number(process.env.CF_AI_IMAGE_STEPS_FLUX2) || 20;
export const CF_AI_IMAGE_GUIDANCE_FLUX2 = Number(process.env.CF_AI_IMAGE_GUIDANCE_FLUX2) || 4;

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
export const CAPTION_MAX_CHARS = 150;

// Default/fallback font — used if an aesthetic ID isn't found in CAPTION_STYLES
// below, or by any code that still imports FONT_PATH directly instead of
// going through getCaptionStyle().
export const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'Montserrat-Bold.ttf');

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;
export const CLOUDINARY_FOLDER = 'ai-slideshow';
export const CLOUDINARY_EXPIRE_DAYS = 7;

// ─── Caption typography + color per visual world ──────────────────────────────
// One display font + a small palette per aesthetic, so captions look like part
// of the artwork instead of a generic bold-sans overlay.
export type CaptionStyle = {
  fontFamily: string;
  fontFile: string;
  textColor: string;
  strokeColor: string;
  accentColor: string;
  maxCharsPerLine: number;
  maxChars: number;
};

export const CAPTION_STYLES: Record<string, CaptionStyle> = {
  'psychology-minimalist': {
    fontFamily: 'Space Grotesk',
    fontFile: 'SpaceGrotesk-Bold.ttf',
    textColor: '#1A1A1A',
    strokeColor: '#EAEAEA',
    accentColor: '#0055A4',
    maxCharsPerLine: 34,
    maxChars: 85,
  },
  'wealth-editorial': {
    fontFamily: 'Fraunces 72pt Black',
    fontFile: 'Fraunces-Black.ttf',
    textColor: '#F0EDE6',
    strokeColor: '#1C1917',
    accentColor: '#4A0E17',
    maxCharsPerLine: 36,
    maxChars: 90,
  },
  'history-cinematic': {
    // Same story as Fraunces above: instancing Cinzel's variable font to
    // wght=900 produces a static face named "Cinzel Black", not "Cinzel".
    fontFamily: 'Cinzel Black',
    fontFile: 'Cinzel-Black.ttf',
    textColor: '#FFFFF0',
    strokeColor: '#27272A',
    accentColor: '#C5A059',
    maxCharsPerLine: 29,
    maxChars: 72,
  },
  'learn-technical': {
    fontFamily: 'Big Shoulders Stencil Display',
    fontFile: 'BigShouldersStencilDisplay-Bold.ttf',
    textColor: '#F4F4F4',
    strokeColor: '#09090B',
    accentColor: '#CC5500',
    maxCharsPerLine: 48,
    maxChars: 120,
  },
};

export function getCaptionStyle(aestheticId: string): CaptionStyle {
  return CAPTION_STYLES[aestheticId] ?? {
    fontFamily: 'Montserrat',
    fontFile: 'Montserrat-Bold.ttf',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    accentColor: '#FFD23F',
    maxCharsPerLine: CAPTION_MAX_CHARS_PER_LINE,
    maxChars: CAPTION_MAX_CHARS,
  };
}

// ─── Content types ────────────────────────────────────────────────────────────
export const CONTENT_TYPES = { SHORTS: 'shorts', LONG: 'long' } as const;
export type ContentType = typeof CONTENT_TYPES[keyof typeof CONTENT_TYPES];

// ─── Long-form video + image dimensions ──────────────────────────────────────
export const LONG_VIDEO_WIDTH = 1920;
export const LONG_VIDEO_HEIGHT = 1080;
export const LONG_CF_AI_SLIDE_WIDTH = 1344;
export const LONG_CF_AI_SLIDE_HEIGHT = 768;
export const LONG_THUMBNAIL_WIDTH = 1920;
export const LONG_THUMBNAIL_HEIGHT = 1080;


export const LONG_FORM_CAPTION_STYLES: Record<string, CaptionStyle & { maxWords: number }> = {
  'psychology-minimalist': { ...CAPTION_STYLES['psychology-minimalist'], maxCharsPerLine: 58, maxChars: 145, maxWords: 20 },
  'wealth-editorial':      { ...CAPTION_STYLES['wealth-editorial'],      maxCharsPerLine: 60, maxChars: 150, maxWords: 20 },
  'history-cinematic':     { ...CAPTION_STYLES['history-cinematic'],     maxCharsPerLine: 48, maxChars: 120, maxWords: 20 },
  'learn-technical':       { ...CAPTION_STYLES['learn-technical'],       maxCharsPerLine: 80, maxChars: 200, maxWords: 20 },
};

export function getLongFormCaptionStyle(aestheticId: string): CaptionStyle & { maxWords: number } {
  return LONG_FORM_CAPTION_STYLES[aestheticId] ?? {
    ...getCaptionStyle(aestheticId),
    maxCharsPerLine: 55,
    maxChars: 150,
    maxWords: 20,
  };
}

export const LONG_FORM_PUBLISH_HOUR_UTC = 11;

// ─── Niche profiles ───────────────────────────────────────────────────────────
export type NicheProfile = {
  aestheticId: string;
  toneInstruction: string;
  minQualityScore: number;
};

export const LONG_NICHE_PROFILES: Record<string, NicheProfile> = {
  'Anti-Status Wealth': {
    aestheticId: 'wealth-editorial',
    minQualityScore: 5,
    toneInstruction: `You are ruthlessly tearing down middle-class money myths. Your audience needs a brutal wake-up call about how leverage and money actually work.
    
Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Write in punchy, aggressive paragraphs (15–20 words). Structure: Controversial Hook → The Mathematical Proof → The Hidden Trap → The Elite Leverage → The Uncomfortable Reality. Include exact dates and massive dollar amounts. Expose luxury as a trap for the insecure. Sound like a deeply cynical hedge fund manager who is sick of the lies. Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'Weaponized History': {
    aestheticId: 'history-cinematic',
    minQualityScore: 5,
    toneInstruction: `You are connecting brutal historical realities directly to modern geopolitical anxiety. Your audience needs to realize that history is a terrifying, repeating loop.

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Write in driving, relentless paragraphs (15–20 words). Structure: The Unsettling Parallel → The Historical Brutality → The Core Mechanism of Power → The Modern Execution → The Inevitable Collapse. Do not soften the edges of history. Make the viewer feel the dread of realizing that the systems controlling them now are identical to the ones that collapsed empires before. Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'Behavioral Friction': {
    aestheticId: 'psychology-minimalist',
    minQualityScore: 5,
    toneInstruction: `You are confronting the biological and psychological weaknesses of your audience. Your goal is to deliver deeply uncomfortable truths about human nature.

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Write in aggressive, direct paragraphs (15–20 words). Structure: The Biological Weakness → The Illusion of Control → The Harsh Neurological Reality → The Aggressive Fix → The Verdict. Attack modern coping mechanisms (dopamine detoxes, self-care) as placebos for people who lack real discipline. Break down human behavior into raw evolutionary incentives. Do not comfort the viewer. Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'System Reverse-Engineering': {
    aestheticId: 'learn-technical',
    minQualityScore: 5,
    toneInstruction: `You are exposing how modern systems—tech algorithms, supermarkets, media—actively manipulate human cognition. Your audience is blind to the matrix they live in.

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Write in sharp, rapid-fire paragraphs (15–20 words). Structure: The Invisible Trap → The Neurochemical Mechanism → The Corporate Intent → The Staggering Scale → The Escape. Expose the exact math and psychology used by corporations to drain attention and money. Your tone should be urgent, paranoid, and highly analytical. Do not trail off or repeat yourself at the end. End decisively.`,
  },
};

export const NICHE_PROFILES: Record<string, NicheProfile> = {
  'Anti-Status Wealth': {
    aestheticId: 'wealth-editorial',
    toneInstruction: `Your tone is ruthless, aggressive, and highly contrarian. You are destroying middle-class illusions about wealth and status. 

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Expose the specific mathematical traps of consumerism (e.g., buying a Rolex, saving in a checking account). Explain exactly how the 0.001% actually operate using leverage and hidden math. 

Use specific numbers and harsh logic. Attack the viewer's preconceived notions of "success." 
NEVER use "hustle," "grind," or motivational fluff. Speak like a cynical insider leaking the real rulebook. End with a statement that leaves them questioning every financial decision they've ever made. Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
  },
  'Weaponized History': {
    aestheticId: 'history-cinematic',
    toneInstruction: `Your tone is urgent, cynical, and deeply unsettling. You are weaponizing historical events to explain exactly why modern society is currently collapsing in the exact same way.

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Focus on the brutal realities of power, the absurdity of war, and the mechanisms of control. The facts should hit like a gut punch. Tie an obscure, terrifying historical event directly to a modern anxiety (e.g. tech monopolies, inflation, surveillance). 

Make the viewer feel the dread of realizing nothing has changed. Let the raw facts do the work—no need for exaggeration. Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
  },
  'Behavioral Friction': {
    aestheticId: 'psychology-minimalist',
    toneInstruction: `Your tone is confrontational, cold, and biologically deterministic. You are attacking the viewer's psychological weaknesses and modern coping mechanisms.

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Break down exactly how their brain is failing them. Attack concepts like "motivation," "passion," and "self-care" as lies sold to weak people. Explain the raw evolutionary and neurochemical drivers behind their worst behaviors.

Be brutal. Provide the exact, aggressive psychological fix required to override their weak biology. Do not comfort them. Provide extreme friction. Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
  },
  'System Reverse-Engineering': {
    aestheticId: 'learn-technical',
    toneInstruction: `Your tone is paranoid, rapid-fire, and hyper-analytical. You are exposing the invisible systems designed to manipulate the viewer's behavior and wallet.

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Reverse-engineer exactly how supermarkets, tech algorithms, or casinos mathematically guarantee you lose. Focus on the sinister ingenuity of these systems. 

Build momentum through rapid-fire facts. The viewer must leave feeling like they just took the red pill and can now see the matrix of manipulation around them. Never sound boring or academic. Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
  },
};

export const DEFAULT_NICHE_PROFILE: NicheProfile = {
  aestheticId: 'learn-technical',
  toneInstruction: `Your tone is aggressive, fast-paced, and highly polarizing. Present facts as direct attacks on conventional wisdom.`,
  minQualityScore: 5,
};

export type Aesthetic = {
  id: string;
  instruction: string;
  imagePrefix: string;
  thumbnailPrefix: string;
};

// FLUX.1 [schnell] optimized image prefixes.

export const AESTHETICS: Record<string, Aesthetic> = {
  'psychology-minimalist': {
    id: 'psychology-minimalist',
    instruction: 'Describe an unsettling, high-contrast minimalist concept mapping to biological weakness or anxiety: think sterile liminal spaces, stark shadows, and isolated geometric objects.',
    imagePrefix: 'A deeply unsettling, high-contrast photograph of surreal minimalism. Empty liminal spaces, deep shadows, geometric forms, isolated objects. Desaturated off-white and cold, sickly greys. Absolutely no cinematic lighting, no bloom, no glowing edges, no glossy reflections, no neon. Stark shadows, flat light, matte finish, muted colors. No text, letters, or numbers anywhere. ',
    thumbnailPrefix: 'A deeply unsettling photograph of surreal minimalism. Empty liminal spaces, deep shadows, geometric forms, isolated objects. Desaturated off-white and cold greys. Strong asymmetrical composition with a large clean void on one side for text overlay. Matte finish, flat light. No text, letters, or numbers anywhere. ',
  },
  'wealth-editorial': {
    id: 'wealth-editorial',
    instruction: 'Describe a cynical, high-end luxury macro concept: think extreme close-ups of money, expensive materials, marble, and corporate power symbols shot with harsh, ugly flash.',
    imagePrefix: 'An extreme macro photograph of cynical high-end luxury or financial elements. Thick paper textures, marble, mahogany, stark corporate architecture, harsh direct camera flash. Extremely high contrast, desaturated. Absolutely no digital UI, no trading terminals, no cinematic lighting, no glowing elements. Flat, ugly, aggressive lighting. No legible text, letters, numbers, or stamps anywhere. ',
    thumbnailPrefix: 'An extreme macro photograph of high-end luxury or financial elements. Thick paper textures, marble, mahogany, stark corporate architecture, harsh direct camera flash. Extremely high contrast, desaturated. Large blank void on one side for overlay. No digital UI, no glowing elements. No legible text, letters, numbers, or stamps anywhere. ',
  },
  'history-cinematic': {
    id: 'history-cinematic',
    instruction: 'Describe a terrifying historical archival concept: think dusty war rooms, oppressive ruins, and brutalist structures shot on medium format film.',
    imagePrefix: 'A medium-format film photograph of gritty, oppressive historical archives or ruins. Dusty rooms, sepia tones, oxidized metal, ancient stone, overcast sky, diffuse flat light. Desaturated earthy, sickly tones. Absolutely no epic cinematic lighting, no god rays, no human figures, no marble statues. Cold, stark, terrifyingly empty scene. No text, letters, or symbols anywhere. ',
    thumbnailPrefix: 'A medium-format film photograph of gritty, oppressive historical archives or ruins. Overcast sky, diffuse flat light. Desaturated earthy tones. Bold asymmetrical composition with a large blank void for overlay. Absolutely no epic cinematic lighting, no glowing edges, no human figures, no marble statues. No text or characters anywhere. ',
  },
  'learn-technical': {
    id: 'learn-technical',
    instruction: 'Describe a stark, paranoid utilitarian explainer concept: think a single fascinating object or cross-section on concrete shot with an aggressive direct flash.',
    imagePrefix: 'A stark, aggressive flash photograph of a single fascinating object or mechanical cross-section on a scuffed, dirty concrete floor. Hard shadows, flat colors. Highly desaturated, paranoid framing. Absolutely no tactical HUDs, no glowing elements, no cinematic lighting. Purely functional, highly legible, but unsettling. No text, letters, or labels anywhere. ',
    thumbnailPrefix: 'A stark, aggressive flash photograph of a single fascinating object or cross-section on a scuffed concrete floor. Hard shadows, flat colors. Desaturated, paranoid framing. Aggressively asymmetrical composition, large blank void for overlay. Absolutely no tactical HUDs, no glowing elements, no cinematic lighting. No text, letters, numbers, or labels anywhere. ',
  },
};

export const QUALITY_GATE_MAX_RETRIES = 4;