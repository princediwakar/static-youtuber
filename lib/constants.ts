import path from 'path';

export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'english_shots';

export const NICHES = ['Modern Indian History', 'Geography'];
export const FORMATS = ['story', 'quiz', 'facts'];

export const SLIDE_COUNT = 6;

// ─── Model config ─────────────────────────────────────────────────────────────
// All text generation now runs on Gemini — no separate DeepSeek dependency.
// Flash-Lite handles topic generation, script writing, and the quality gate.
// Use Flash for the quality gate if you want stronger reasoning (costs more).
export const GEMINI_TEXT_MODEL = 'gemini-3.1-flash-lite';       // topic gen + script gen
export const GEMINI_QUALITY_GATE_MODEL = 'gemini-3.1-flash-lite'; // script scoring (swap to gemini-3.5-flash for higher accuracy)

export const IMAGE_MODEL = 'gemini-2.5-flash-image';
export const IMAGE_MODEL_THUMBNAIL = 'gemini-3.1-flash-image';
export const IMAGE_ASPECT_RATIO = '9:16';

export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
export const TTS_SAMPLE_RATE = 24000;

// ─── TTS Voice profiles (per niche) ──────────────────────────────────────────
// Charon is "Informative" — fine, but the system prompt was pushing it into
// melodrama. We now control tone via the TTS prompt instead of just the voice.
// Sadaltager ("Knowledgeable") and Orus ("Firm") are better documentary fits.
export const TTS_VOICE_PROFILES: Record<string, TTSVoiceProfile> = {
  'Geography': {
    voice: 'Sadaltager',  // Knowledgeable — calm, authoritative
    directorNotes: `
# AUDIO PROFILE: Documentary Narrator
## "Geography Shorts"

### THE SCENE
A quiet, professional recording booth. No drama. The narrator has read the
briefing notes and is sharing something genuinely fascinating with a
curious friend.

### DIRECTOR'S NOTES
Style: Calm, authoritative, and quietly astonished — like a BBC or National
Geographic documentary narrator who has just discovered something genuinely
strange. Build tension through facts and pacing, NOT through theatrical emphasis.
Conversational but with gravitas. Never sensational.

Pacing: Brisk but measured. Slight natural pause before key facts to let them land.
Each slide reads in 3–4 seconds. Never slow enough to feel ponderous.

Accent: Clear, neutral international English.`,
  },
  'Modern Indian History': {
    voice: 'Orus',  // Firm — authoritative, serious
    directorNotes: `
# AUDIO PROFILE: History Narrator  
## "Modern Indian History Shorts"

### THE SCENE
A focused narrator delivering a well-researched historical account.
Serious, respectful of the subject matter. The weight of history is present.

### DIRECTOR'S NOTES
Style: Grave and authoritative — like a respected historian narrating a
pivotal documentary. The events matter. Speak with the gravitas they deserve.
Tension comes from the facts, not from vocal performance.

Pacing: Brisk but deliberate. Key names, dates, and figures get a brief natural
beat before them. Each slide reads in 3–4 seconds. The listener should feel
informed, not entertained.

Accent: Clear, neutral international English.`,
  },
};

export const DEFAULT_TTS_VOICE_PROFILE: TTSVoiceProfile = {
  voice: 'Sadaltager',
  directorNotes: `
### DIRECTOR'S NOTES
Style: Calm, authoritative documentary narrator. Tension from facts, not voice.
Pacing: Brisk but measured. Brief pause before key facts. Each slide reads in 3–4 seconds.
Accent: Clear, neutral international English.`,
};

export type TTSVoiceProfile = {
  voice: string;
  directorNotes: string;
};

export const MUSIC_MODEL = 'lyria-3-clip-preview';
export const MODAL_RENDER_URL = process.env.MODAL_RENDER_URL || 'https://example-modal-url.com/render';

export const FFMPEG_CRF = '23';
export const FFMPEG_PRESET = 'medium';
export const FFMPEG_AUDIO_BITRATE = '128k';
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 25;

export const ZOOMPAN_ZOOM_IN_START = 1.0;
export const ZOOMPAN_ZOOM_IN_END = 1.12;
export const ZOOMPAN_ZOOM_OUT_START = 1.12;
export const ZOOMPAN_ZOOM_OUT_END = 1.0;
export const ZOOMPAN_SPEED = 0.0012;

export const XFADE_DURATION = 0;
export const XFADE_TRANSITIONS = [
  'fade', 'slideleft', 'slideup', 'wiperight', 'smoothleft', 'circlecrop',
] as const;

export const MUSIC_VOLUME = 0.35;
export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
export const MUSIC_FILES = ['focus-01.mp3', 'tension-01.mp3', 'ambient-01.mp3'];
export const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';

export const CAPTION_FONT_SIZE = 72;
export const CAPTION_MAX_CHARS_PER_LINE = 15;
export const CAPTION_MAX_CHARS = 80; // first-pass filter; line-count check is the binding constraint
export const CAPTION_Y_POSITION = 0.72;
export const CAPTION_LINE_HEIGHT = 84;
export const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'Montserrat-Bold.ttf');

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;
export const CLOUDINARY_FOLDER = 'ai-slideshow';
export const CLOUDINARY_EXPIRE_DAYS = 7;

// ─── Niche profiles: couples niche → aesthetic + tone + format weights ────────
// This replaces random aesthetic selection and the GDP-only country restriction.
// Each profile locks in a coherent visual/tonal identity for a channel niche.
export type NicheProfile = {
  aestheticId: string;
  toneInstruction: string;   // injected into the script system prompt
  formatWeights: { story: number; facts: number; quiz: number };
  // Quality threshold for the script gate (0–10). Reject below this.
  minQualityScore: number;
};

export const NICHE_PROFILES: Record<string, NicheProfile> = {
  'Geography': {
    aestheticId: 'vector',
    toneInstruction: `Your tone is calm, authoritative, and quietly astonished — like a BBC or
National Geographic documentary narrator who has discovered something genuinely
strange. Build tension through FACTS and PACING, not theatrical emphasis.
NEVER use words like "mind-blowing", "insane", or "you won't believe".
Instead, let the specificity of the facts do the work.`,
    formatWeights: { story: 0.4, facts: 0.5, quiz: 0.1 },
    minQualityScore: 6,
  },
  'Modern Indian History': {
    aestheticId: 'dossier',
    toneInstruction: `Your tone is grave, authoritative, and historically precise — like a respected
historian narrating a landmark documentary. The weight of these events matters.
Build tension through chronology and consequence, not theatrical language.
NEVER use words like "mind-blowing" or "insane". Use exact dates, names, and numbers.`,
    formatWeights: { story: 0.6, facts: 0.3, quiz: 0.1 },
    minQualityScore: 6,
  },
};

export const DEFAULT_NICHE_PROFILE: NicheProfile = {
  aestheticId: 'vector',
  toneInstruction: `Your tone is calm, authoritative, and intriguing. Build tension through
facts and pacing, not theatrical emphasis.`,
  formatWeights: { story: 0.4, facts: 0.4, quiz: 0.2 },
  minQualityScore: 5,
};

// ─── Aesthetics (keyed by id for profile lookup) ─────────────────────────────
export type Aesthetic = {
  id: string;
  instruction: string;
  imagePrefix: string;
  thumbnailPrefix: string;
  // Negative prompt — appended to every image prompt to reduce common failures
  imageNegative: string;
};

export const AESTHETICS: Record<string, Aesthetic> = {
  dossier: {
    id: 'dossier',
    instruction: 'All images must feel like a premium, dark, cinematic classified dossier.',
    imagePrefix: 'vintage archival photograph, high contrast black and white, heavily textured film grain, declassified document style, blueprint elements, ominous lighting, no text in image, ',
    thumbnailPrefix: 'vintage archival photograph, declassified document style, high-quality, striking contrast, no text in image, ',
    imageNegative: 'text, watermark, logo, blurry, low quality, unrealistic anatomy, modern style, color photo, bright colors',
  },
  vector: {
    id: 'vector',
    instruction: 'All images must feel like a premium, high-budget educational vector animation (like Kurzgesagt or Vox).',
    imagePrefix: 'premium 2D vector flat art, Kurzgesagt style, dramatic isometric perspective, limited bold color palette, clean geometric shapes, dramatic lighting, no text in image, ',
    thumbnailPrefix: 'premium 2D vector flat art, Kurzgesagt style, bold colors, high-quality, striking contrast, no text in image, ',
    imageNegative: 'text, watermark, logo, blurry, low quality, photorealistic, 3D render, stock photo, cluttered',
  },
};

// ─── Script quality gate thresholds ──────────────────────────────────────────
export const QUALITY_GATE_MAX_RETRIES = 2; // how many times to regenerate before giving up