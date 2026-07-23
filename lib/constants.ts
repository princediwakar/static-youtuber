// Path: lib/constants.ts
import path from 'path';

export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'canvas_center';

export const NICHES = ['Anti-Status Wealth', 'Weaponized History', 'YouTube Automation', 'System Reverse-Engineering'];

// One niche per channel — deterministic, no random selection
export const ACCOUNT_NICHE: Record<string, string> = {
  canvas_center: 'Anti-Status Wealth',
  canvas_area: 'Weaponized History',
  canvas_station: 'YouTube Automation',
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
  'YouTube Automation':         { RAPID_FIRE: 1.0, SLOW_BURN: 0,   THE_LIST: 0.0, DEEP_DIVE: 0 },
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
    textColor: '#000000',
    strokeColor: '#FFFFFF',
    accentColor: '#FF2A00',    // Aggressive alert red
    maxCharsPerLine: 34,
    maxChars: 85,
  },
  'wealth-editorial': {
    fontFamily: 'Fraunces 72pt Black',
    fontFile: 'Fraunces-Black.ttf',
    textColor: '#000000',
    strokeColor: '#FFFFFF',
    accentColor: '#00D15E',    // Institutional money green
    maxCharsPerLine: 32,       // Tighter for heavy serif readability
    maxChars: 80,
  },
  'history-cinematic': {
    fontFamily: 'Cinzel Black',
    fontFile: 'Cinzel-Black.ttf',
    textColor: '#000000',
    strokeColor: '#FFFFFF',
    accentColor: '#E6A822',    // Oxidized gold
    maxCharsPerLine: 28,
    maxChars: 72,
  },
  'learn-technical': {
    fontFamily: 'Big Shoulders Stencil Display',
    fontFile: 'BigShouldersStencilDisplay-Bold.ttf',
    textColor: '#000000',
    strokeColor: '#FFFFFF',
    accentColor: '#FFC000',    // High-vis hazard yellow
    maxCharsPerLine: 42,
    maxChars: 120,
  },
};

export function getCaptionStyle(aestheticId: string): CaptionStyle {
  return CAPTION_STYLES[aestheticId] ?? {
    fontFamily: 'Montserrat',
    fontFile: 'Montserrat-Bold.ttf',
    textColor: '#000000',
    strokeColor: '#FFFFFF',
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
  'YouTube Automation': {
    aestheticId: 'learn-technical',
    minQualityScore: 5,
    toneInstruction: `You are exposing the massive inefficiency of manual YouTube channel management. Your audience is wasting hours on metadata instead of creating content.

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Write in aggressive, direct paragraphs (15–20 words). Structure: The Wasted Time → The Illusion of Hard Work → The Automation Secret → The Software Solution → The CTA. Attack manual uploads as a trap for amateurs. Always seamlessly position "YouTube Playlist Uploader" as the ultimate fix. Do not trail off or repeat yourself at the end. End decisively.`,
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
  'YouTube Automation': {
    aestheticId: 'learn-technical',
    toneInstruction: `Your tone is confrontational, fast-paced, and highly technical. You are attacking the viewer's inefficient video upload workflow.

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Break down exactly how many hours they are wasting on titles, tags, and descriptions. Attack manual labor as a lie sold to amateurs. Explain the exact mechanism of batch uploading and AI metadata generation.

Be brutal. Position "YouTube Playlist Uploader" as the only logical solution. Do not comfort them. Do not trail off or repeat yourself at the end. End decisively.`,
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
    instruction: 'Force a clinical, paranoid surveillance aesthetic. Mediums: CCTV footage, thermal imaging, harsh flash polaroids, or sterile medical textbook illustrations. The scenes should feel invasive and uncomfortable.',
    imagePrefix: 'A low-fidelity surveillance image. Physical medium: gritty CCTV capture, harsh direct flash photography, or stark thermal imaging. Extreme contrast, degraded resolution, raw, paranoid framing. Absolutely no smooth gradients, no 3D renders, no soft lighting. Ugly, clinical, and striking. No legible text. ',
    thumbnailPrefix: 'A gritty surveillance or harsh flash photograph. Extreme contrast, clinical and paranoid framing. Massive blank void on one side for text. No text, letters, or numbers in the image itself. ',
  },
  'wealth-editorial': {
    id: 'wealth-editorial',
    instruction: 'Force a ruthless institutional aesthetic. Mediums: Macro photography of currency, classified document redactions, brutalist corporate architecture on 35mm film, heavy halftone newspaper prints.',
    imagePrefix: 'A macro physical artifact of institutional power. Physical medium: 16mm microfilm scan, heavy halftone newspaper print, or extreme macro of heavily textured paper/currency/marble. Stark black, white, and harsh lighting. No digital trading UI, no neon, no glossy luxury ads. Pure cold power. No legible text or characters. ',
    thumbnailPrefix: 'An aggressive macro shot of institutional texture (marble, heavy paper, ink). Stark contrast. Heavy halftone or microfilm aesthetic. Massive blank void on one side. No legible text. ',
  },
  'history-cinematic': {
    id: 'history-cinematic',
    instruction: 'Force a forensic archival aesthetic. Mediums: Degraded silver gelatin prints, classified evidence boards, macro shots of rust/shrapnel, or muddy trench photography.',
    imagePrefix: 'A terrifying forensic archival photograph. Physical medium: degraded silver gelatin print, harsh evidence-board flash, or physical macro of rusted metal/bone/dirt. Heavy film grain, scratches, light leaks. Absolutely no majestic cinematic lighting, no clean statues. Visceral, physical decay. No text, letters, or symbols. ',
    thumbnailPrefix: 'A degraded silver gelatin print or harsh evidence-board photo. Heavy film grain, extreme physical decay. Bold asymmetrical composition with a large blank void for overlay. No text or characters anywhere. ',
  },
  'learn-technical': {
    id: 'learn-technical',
    instruction: 'Force a brutal industrial/schematic aesthetic. Mediums: Two-color risograph prints, heavy blueprint cyanotypes, electron microscope scans, or harsh xerox copies.',
    imagePrefix: 'An industrial technical document scan. Physical medium: heavy xerox photocopy, two-color risograph print, or high-contrast electron microscope scan. Gritty paper texture, absolute flat depth of field. Purely utilitarian. No 3D renders, no neon sci-fi HUDs. No text, letters, or numbers anywhere. ',
    thumbnailPrefix: 'An industrial xerox photocopy or risograph print aesthetic. High-contrast, gritty paper texture. Aggressively asymmetrical composition, large blank void for overlay. No text, letters, numbers, or labels anywhere. ',
  },
};

export const QUALITY_GATE_MAX_RETRIES = 4;