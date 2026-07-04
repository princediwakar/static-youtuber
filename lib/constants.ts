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
export const FISH_AUDIO_MODEL = 's2.1-pro-free';

// Edge TTS fallback (self-hosted on EC2)
export const EDGE_TTS_URL = process.env.EDGE_TTS_URL || 'http://localhost:5050';
export const EDGE_TTS_API_KEY = process.env.EDGE_TTS_API_KEY || 'your_api_key_here';

// Default Fish Audio reference_id (Generic Female / English).
// Swap per niche if different voices are desired.
const FISH_VOICE_GENERIC_FEMALE = 'fb6c0e1ea91e427fb9a93b9bbf0a1e4d';

export type TTSVoiceProfile = {
  referenceId: string;
  fallbackVoice: string;
  directorNotes: string;
};

export const TTS_VOICE_PROFILES: Record<string, TTSVoiceProfile> = {
  'SaaS & AI Tools': {
    referenceId: FISH_VOICE_GENERIC_FEMALE,
    fallbackVoice: 'en-US-AriaNeural',
    directorNotes: 'Style: Crisp and confident. Pace is brisk. Enunciate product names clearly. Never sound salesy. Let the utility of the tool speak for itself.',
  },
  'Financial Forensics': {
    referenceId: FISH_VOICE_GENERIC_FEMALE,
    fallbackVoice: 'en-US-GuyNeural',
    directorNotes: 'Style: Grave and precise. Build tension through the scale of the numbers. Never sensational. Let the facts indict.',
  },
  'Stoic Philosophy': {
    referenceId: FISH_VOICE_GENERIC_FEMALE,
    fallbackVoice: 'en-US-ChristopherNeural',
    directorNotes: 'Style: Deep, measured, and resonant. Gritty but controlled. Speak slowly. Let the words land.',
  },
  'Urban Survival': {
    referenceId: FISH_VOICE_GENERIC_FEMALE,
    fallbackVoice: 'en-US-EricNeural',
    directorNotes: 'Style: Urgent but controlled. Authoritative without being theatrical. Gear names, specs, and critical steps are enunciated with extra clarity.',
  },
};

// ─── Music ─────────────────────────────────────────────────────────────────────
export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
export const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';

export const FORMATS = FORMAT_TEMPLATES; // alias for backward compatibility

export const DEFAULT_TTS_VOICE_PROFILE: TTSVoiceProfile = {
  referenceId: FISH_VOICE_GENERIC_FEMALE,
  fallbackVoice: 'en-US-AriaNeural',
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

// FLUX.1 [schnell] optimized image prefixes — natural language paragraphs, not comma tags.
// FLUX uses a T5-XXL text encoder that understands syntax, spatial relationships, and composition.
// These prefixes establish a "base reality" that Pass 2 appends its subject description to.
export const AESTHETICS: Record<string, Aesthetic> = {
  dossier: {
    id: 'dossier',
    instruction: 'Write a highly descriptive, cinematic paragraph. Treat the image as a classified, high-contrast archival document.',
    imagePrefix: 'A striking, high-contrast black and white cinematic photograph resembling a declassified archival document. The scene features dramatic chiaroscuro lighting, deep shadows, and heavy vintage film grain. There are absolutely no written words or text anywhere in the environment. ',
    thumbnailPrefix: 'A striking black and white cinematic photograph resembling a declassified document with dramatic shadows and heavy film grain. The composition includes vast, completely empty dark space specifically designed for a text overlay. There is no existing text in the image. ',
  },
  vector: {
    id: 'vector',
    instruction: 'Write a highly descriptive, structural paragraph. Treat the image as a premium, high-budget UI/UX product demo.',
    imagePrefix: 'A pristine, high-budget 2D vector flat art illustration shot from an isometric perspective. The scene uses a bold, limited color palette, geometric shapes, dramatic studio lighting, and smooth matte textures. The environment is entirely devoid of text, labels, or UI typography to leave room for overlays. ',
    thumbnailPrefix: 'A pristine 2D vector flat art illustration with a bold color palette and isometric perspective. The composition is radically asymmetrical, leaving vast empty negative space perfectly suited for a bold thumbnail text overlay. No existing text or logos. ',
  },
  'dark-cinematic': {
    id: 'dark-cinematic',
    instruction: 'Write a highly descriptive, cinematic paragraph. Treat the image as an epic, moody frame from a philosophical epic.',
    imagePrefix: 'A dark, moody cinematic photograph utilizing dramatic chiaroscuro lighting. The scene is defined by deep desaturated blacks, rich textures like rough marble or worn stone, and an epic, solitary atmosphere under a brooding sky. The composition is completely free of any text, symbols, or modern artifacts. ',
    thumbnailPrefix: 'A dark, moody cinematic photograph with dramatic lighting, deep shadows, and a solitary atmosphere. The framing leaves massive, completely empty dark space for bold thumbnail text overlays. There are absolutely no written words in the image. ',
  },
  tactical: {
    id: 'tactical',
    instruction: 'Write a highly descriptive, cinematic paragraph. Treat the image as a hyper-realistic, high-stakes operational photograph.',
    imagePrefix: 'A hyper-realistic, gritty tactical photograph shot with a shallow depth of field. The scene features matte black surfaces, dramatic practical lighting, and a moody urban or survival environment filled with atmospheric haze. The environment contains no text, no branding, and no signage of any kind. ',
    thumbnailPrefix: 'A hyper-realistic tactical photograph with dramatic moody lighting and shallow depth of field. The composition pushes the main subject to the edge, featuring stark negative space perfectly suited for large text overlays. Absolutely no text or logos exist in the scene. ',
  },
};

export const QUALITY_GATE_MAX_RETRIES = 2;
