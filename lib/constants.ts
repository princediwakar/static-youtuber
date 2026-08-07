// Path: lib/constants.ts
import path from 'path';

export function getModalUrl(baseEnvVarName: string, fallback: string = ''): string {
  const urls: string[] = [];
  
  if (process.env[baseEnvVarName]) {
    urls.push(process.env[baseEnvVarName] as string);
  }
  
  let i = 2;
  while (process.env[`${baseEnvVarName}_${i}`]) {
    urls.push(process.env[`${baseEnvVarName}_${i}`] as string);
    i++;
  }
  
  if (urls.length === 0) {
    return fallback;
  }
  
  const randomIndex = Math.floor(Math.random() * urls.length);
  return urls[randomIndex];
}

export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'canvas_center';

export const NICHES = ['Trade Wealth', 'The Case File', 'Second Act', 'YouTube Automation', 'Clinic Builders'];

export const ACCOUNT_NICHE: Record<string, string> = {
  canvas_center: 'Trade Wealth',
  canvas_area: 'The Case File',
  canvas_base: 'Second Act',
  canvas_station: 'YouTube Automation',
  clinic_playbook: 'Clinic Builders',
};

// Immutable YouTube channel IDs — handles can be renamed, these never change
export const ACCOUNT_YOUTUBE_CHANNEL_ID: Record<string, string> = {
  canvas_center: 'UCYJQqqRf4tMxc7ra5FF08eQ',
  canvas_area: 'UCzKvcGH7IyS684PQ4aCw2PQ',
  canvas_base: 'UC6gH91v6aGmQFdNwMFC5RwQ',
  canvas_station: 'UCnBL50AkM_6BmvrNlS1rxVw',
  clinic_playbook: 'UC29YBI6AEHANR5sad6P2sww',
};


// ─── Format templates ───────────────────────────────────────────────────────────
export const FORMAT_TEMPLATES = ['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST', 'DEEP_DIVE'] as const;
export type FormatTemplate = typeof FORMAT_TEMPLATES[number];

export const FORMAT_TEMPLATE_WEIGHTS: Record<string, Record<FormatTemplate, number>> = {
  'Trade Wealth':       { RAPID_FIRE: 0.3, SLOW_BURN: 0.2, THE_LIST: 0.3, DEEP_DIVE: 0.2 },
  'The Case File':      { RAPID_FIRE: 0.2, SLOW_BURN: 0.6, THE_LIST: 0.0, DEEP_DIVE: 0.2 },
  'Second Act':         { RAPID_FIRE: 0.4, SLOW_BURN: 0.4, THE_LIST: 0.2, DEEP_DIVE: 0.0 },
  'YouTube Automation': { RAPID_FIRE: 1.0, SLOW_BURN: 0.0, THE_LIST: 0.0, DEEP_DIVE: 0.0 },
  'Clinic Builders':    { RAPID_FIRE: 0.5, SLOW_BURN: 0.3, THE_LIST: 0.2, DEEP_DIVE: 0.0 },
};

export const TEMPLATE_SHOT_COUNTS: Record<FormatTemplate, { min: number; max: number }> = {
  RAPID_FIRE: { min: 15, max: 25 },
  SLOW_BURN:  { min: 12, max: 18 },
  THE_LIST:   { min: 12, max: 20 },
  DEEP_DIVE:  { min: 30, max: 60 }, // long-form only — never selected by shorts bandit
};

// LLM config (Modal vLLM endpoint)
export const getModalLlmUrl = () => getModalUrl('MODAL_LLM_URL', 'https://mental-alternate--llm-server-fastapi-app.modal.run');

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
export const getF5TtsUrl = () => getModalUrl('F5_TTS_URL');
export const F5_TTS_API_KEY = process.env.F5_TTS_API_KEY || '';

// ACE-Step BGM Modal endpoint (instrumental music generation)
export const getAceStepBgmUrl = () => getModalUrl('ACE_STEP_BGM_URL');
export const ACE_STEP_API_KEY = process.env.ACE_STEP_API_KEY || '';
// Separate endpoint for warmup. Modal fastapi_endpoint creates a unique domain
// per method, so appending /warmup to the BGM URL won't work.
// Falls back to deriving from ACE_STEP_BGM_URL by replacing the method slug.
export const getAceStepWarmupUrl = () => {
  const explicitUrl = getModalUrl('ACE_STEP_WARMUP_URL');
  if (explicitUrl) return explicitUrl;
  const bgmUrl = getAceStepBgmUrl();
  return bgmUrl ? bgmUrl.replace('-generate-bgm', '-warmup') : '';
};

// ─── Music ─────────────────────────────────────────────────────────────────────
export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
export const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';

export const FORMATS = FORMAT_TEMPLATES; // alias for backward compatibility

export const getModalRenderUrl = () => getModalUrl('MODAL_RENDER_URL', 'https://example-modal-url.com/render');

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
  'industrial-wealth': {
    fontFamily: 'Anton',
    fontFile: 'Anton-Regular.ttf',
    textColor: '#FFC000',      // High-vis yellow
    strokeColor: '#000000',
    accentColor: '#FFFFFF',
    maxCharsPerLine: 32,
    maxChars: 80,
  },
  'raw-rebuild': {
    fontFamily: 'Inter',
    fontFile: 'Inter-Bold.ttf',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    accentColor: '#4A90E2',    // Calm rebuilding blue
    maxCharsPerLine: 38,
    maxChars: 95,
  },
  'clinical-architectural': {
    fontFamily: 'Space Grotesk',
    fontFile: 'SpaceGrotesk-Bold.ttf',
    textColor: '#FFFFFF',
    strokeColor: '#000000',
    accentColor: '#00D15E',    // Surgical/medical green
    maxCharsPerLine: 34,
    maxChars: 85,
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
  'industrial-wealth':       { ...CAPTION_STYLES['industrial-wealth'],       maxCharsPerLine: 60, maxChars: 150, maxWords: 20 },
  'raw-rebuild':             { ...CAPTION_STYLES['raw-rebuild'],             maxCharsPerLine: 70, maxChars: 175, maxWords: 20 },
  'clinical-architectural':  { ...CAPTION_STYLES['clinical-architectural'],  maxCharsPerLine: 65, maxChars: 160, maxWords: 20 },
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
  'Trade Wealth': {
    aestheticId: 'industrial-wealth',
    minQualityScore: 5,
    toneInstruction: `You are breaking down the financial math for trade business owners (electricians, HVAC contractors, welders). Your audience is high-income but often struggles to build real wealth.

Never use passive voice. Start with a polarizing statement. Present every fact as insider respect and competence. Cut all introductory filler.

Write in forensic, story-driven paragraphs. Structure: One real deal → One real decision → The actual dollar difference. No contempt for the viewer's choices. Include exact dates, equipment costs, and dollar amounts. Break down the math on equipment financing, taxes, and solo-to-crew scaling. Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'The Case File': {
    aestheticId: 'history-cinematic',
    minQualityScore: 5,
    toneInstruction: `You are presenting a serialized reconstruction from real primary sources (letters, transcripts, declassified files). Your audience wants production quality and procedural mystery.

Never use passive voice. Start with a polarizing statement. Present every fact objectively but build extreme tension. Cut all introductory filler.

Write in a tone of procedural mystery. Structure: The Source Document → The Hidden Detail → The Chain Reaction. No "here's what this means for today" moralizing tacked on. Focus entirely on the forensic details of the evidence. Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'Second Act': {
    aestheticId: 'raw-rebuild',
    minQualityScore: 5,
    toneInstruction: `You are providing dignified, real-numbers rebuilding content for people starting over after bankruptcy, divorce, addiction recovery, or business failure.

Never use passive voice. Start with a polarizing statement. Present every fact with hope without saccharine, real numbers without exploitation. Cut all introductory filler.

Write in dignified, practical paragraphs. Structure: The Starting Point → The Principle Framework → The Real-Numbers Rebuild. Keep specific legal/financial/clinical advice out—focus on principles. Respect the viewer's agency. Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'YouTube Automation': {
    aestheticId: 'learn-technical',
    minQualityScore: 5,
    toneInstruction: `You are exposing the massive inefficiency of manual YouTube channel management. Your audience is wasting hours on metadata instead of creating content.

Never use passive voice. Start with a polarizing statement. Present every fact as a counter-narrative to mainstream belief. Cut all introductory filler.

Write in aggressive, direct paragraphs (15–20 words). Structure: The Wasted Time → The Illusion of Hard Work → The Automation Secret → The Software Solution → The CTA. Attack manual uploads as a trap for amateurs. Always seamlessly position "YouTube Playlist Uploader" as the ultimate fix. Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'Clinic Builders': {
    aestheticId: 'clinical-architectural',
    minQualityScore: 5,
    toneInstruction: `You are providing the business education doctors never got in med school. Your audience consists of aspiring, early-stage, or growth-stage clinic owners.

Never use passive voice. Start with a polarizing statement. Present every fact with an empowering, competence-building register. Cut all introductory filler.

Write in highly tactical, clear paragraphs. Structure: The Operational Trap → The Missing Business Logic → The System Fix. Position Doxxy as the invisible tool behind the fix, not the subject. Focus on practical scaling metrics (no-show rates, billing habits, referral systems). Do not trail off or repeat yourself at the end. End decisively.`,
  },
};

export const NICHE_PROFILES: Record<string, NicheProfile> = {
  'Trade Wealth': {
    aestheticId: 'industrial-wealth',
    toneInstruction: `Your tone conveys insider respect and forensic competence. You are speaking to high-income trade business owners (electricians, welders) about how to build actual wealth.

Never use passive voice. Start with a polarizing statement. Present one real deal and one real decision per script.

Expose the specific mathematical traps of running a trade business (e.g., equipment leases, S-Corp vs LLC math). Use specific numbers and harsh logic without ever showing contempt for the viewer's choices. Speak like an insider leaking the real financial rulebook. End with a statement that leaves them reconsidering their business structure. Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
  },
  'The Case File': {
    aestheticId: 'history-cinematic',
    toneInstruction: `Your tone is full of tension and procedural mystery. You are reconstructing historical cases from primary sources (letters, transcripts).

Never use passive voice. Start with a polarizing statement about the document in question.

Focus on the forensic details of the evidence. Let the raw facts build the mystery. Never add moralizing or "what this means for today" takeaways. The facts should hit like a gut punch. Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
  },
  'Second Act': {
    aestheticId: 'raw-rebuild',
    toneInstruction: `Your tone is dignified, providing hope without saccharine and real numbers without exploitation. You are speaking to people rebuilding after major life disruptions.

Never use passive voice. Start with a polarizing statement. Present frameworks and principles for financial rebuilding.

Focus on the real timeline of rebuilding credit, income, and stability. Never use real identifiable hardship without consent. Deliver practical, hard-earned wisdom that treats the viewer as capable and resilient. Do not trail off or repeat yourself at the end. End decisively.`,
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
  'Clinic Builders': {
    aestheticId: 'clinical-architectural',
    toneInstruction: `Your tone is empowering and competence-building. You are giving doctors the hardcore business education they missed in medical school.

Never use passive voice. Start with a polarizing statement about clinic operations.

Focus on the critical numbers: lease negotiations, billing habits, and no-show rates. Build momentum through rapid-fire operational facts. Position Doxxy as the quiet backbone of a well-run clinic. Do not trail off or repeat yourself at the end. End decisively.`,
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
  'industrial-wealth': {
    id: 'industrial-wealth',
    instruction: 'Force an industrial, blue-collar wealth aesthetic. Mediums: Macro photography of copper pipes, raw welded steel, heavy-duty clipboards, dirty blueprints, high-vis industrial textures, and sparks.',
    imagePrefix: 'A raw industrial photograph. Physical medium: gritty 35mm film, harsh job site lighting, or macro of heavy steel/copper. Extreme contrast, heavy textures of rust, metal, and dirt. No digital UIs, no luxury cars, no sterile offices. Pure physical labor and heavy machinery. No legible text or characters. ',
    thumbnailPrefix: 'An aggressive macro shot of industrial texture (welded steel, copper, blueprints). Stark contrast. Heavy physical wear. Massive blank void on one side. No legible text. ',
  },
  'raw-rebuild': {
    id: 'raw-rebuild',
    instruction: 'Force a dignified, raw rebuilding aesthetic. Mediums: Minimalist raw concrete architecture, bright but harsh natural sunlight, blank ledger paper, scaffolding, empty rooms with hard shadows.',
    imagePrefix: 'A stark, minimalist photograph of raw construction or rebuilding. Physical medium: clean 35mm architectural photography. Bright harsh sunlight, heavy shadows, raw concrete, exposed wood, or pristine blank ledgers. Austere, empty, but hopeful. Absolutely no paranoia, no messy clutter. No text or characters. ',
    thumbnailPrefix: 'A clean architectural shot of raw materials or empty sunlit rooms. Harsh shadows, high contrast. Massive blank void on one side for text. No legible text. ',
  },
  'clinical-architectural': {
    id: 'clinical-architectural',
    instruction: 'Force a high-end, sterile medical architecture aesthetic. Mediums: Sleek brushed steel, sterile surgical trays, anatomical wireframes, high-contrast modern clinic architecture, frosted glass.',
    imagePrefix: 'A pristine, high-end clinical photograph. Physical medium: ultra-sharp digital architectural photography. Cool tones, brushed steel, frosted glass, sterile white light, flawless surfaces. No messy hospitals, no warm cozy lighting. Pure clinical efficiency. No legible text or characters. ',
    thumbnailPrefix: 'A sleek, sterile architectural shot of frosted glass or brushed steel. Cool tones, high contrast. Massive blank void on one side for text. No legible text. ',
  },
};

export const QUALITY_GATE_MAX_RETRIES = 4;