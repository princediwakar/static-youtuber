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
export const GEMINI_TEXT_MODEL = 'gemini-3.1-flash-lite';
export const GEMINI_QUALITY_GATE_MODEL = 'gemini-3.1-flash-lite';

export const IMAGE_MODEL = 'gemini-2.5-flash-image';
export const IMAGE_MODEL_THUMBNAIL = 'gemini-3.1-flash-image';
export const IMAGE_ASPECT_RATIO = '9:16';

export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
export const TTS_SAMPLE_RATE = 24000;

export const TTS_VOICE_PROFILES: Record<string, TTSVoiceProfile> = {
  'SaaS & AI Tools': {
    voice: 'Orus',
    directorNotes: `
# AUDIO PROFILE: Tech Reviewer
## "SaaS & AI Tools"

### THE SCENE
A sharp, fast-paced product demo. The narrator knows the software inside out
and is explaining how it solves a real business problem. No filler, no hype —
just crisp, clear, authoritative instruction.

### DIRECTOR'S NOTES
Style: Crisp and confident — like a respected tech YouTuber doing a software
walkthrough. Pace is brisk. Enunciate product names clearly. Never sound
salesy. Let the utility of the tool speak for itself.

Pacing: Fast but controlled. Each shot reads in 2-4 seconds. Slight beat
before the key benefit or feature name.

Accent: Clear, neutral international English.`,
  },
  'Financial Forensics': {
    voice: 'Orus',
    directorNotes: `
# AUDIO PROFILE: Investigative Journalist
## "Financial Forensics"

### THE SCENE
A quiet, serious recording booth. The narrator is breaking down a massive
corporate collapse or market manipulation. The facts are damning. The delivery
is controlled but urgent — like a journalist who has seen the documents and
can barely contain their disbelief.

### DIRECTOR'S NOTES
Style: Grave and precise — like an investigative journalist narrating a
long-form exposé. Build tension through the scale of the numbers and the
specificity of the wrongdoing. Never sensational. Let the facts indict.

Pacing: Measured and deliberate. Key dollar amounts and dates get a brief
beat. Each shot reads in 2-4 seconds. The listener should feel the weight
of the money involved.

Accent: Clear, neutral international English.`,
  },
  'Stoic Philosophy': {
    voice: 'Orus',
    directorNotes: `
# AUDIO PROFILE: Stoic Narrator
## "Stoic Philosophy"

### THE SCENE
A solitary, dimly lit space. The narrator speaks with the weight of someone
who has endured and emerged stronger. Every word is intentional. There is no
rushing — the silence between sentences is as powerful as the sentences.

### DIRECTOR'S NOTES
Style: Deep, measured, and resonant — like a philosopher-warrior reflecting
after battle. Gritty but controlled. Speak slowly. Let the words land. The
listener should feel both challenged and strengthened.

Pacing: Slower than the other niches. Each shot reads in 3-5 seconds.
Pause before moral conclusions. The final line should hang in the air.

Accent: Clear, deep international English with gravitas.`,
  },
  'Urban Survival': {
    voice: 'Sadaltager',
    directorNotes: `
# AUDIO PROFILE: Tactical Briefing
## "Urban Survival"

### THE SCENE
A no-nonsense briefing room. The narrator is delivering actionable intelligence
for a high-stakes scenario. Every second counts. The information could save
someone's life. No drama — just precision.

### DIRECTOR'S NOTES
Style: Urgent but controlled — like a special forces instructor giving a
pre-mission brief. Authoritative without being theatrical. The stakes are
real. Speak with the calm urgency of someone who has been in the scenario.

Pacing: Brisk and direct. Each shot reads in 2-4 seconds.
Gear names, specs, and critical steps are enunciated with extra clarity. No hesitation.

Accent: Clear, neutral international English.`,
  },
};

// ─── Music ─────────────────────────────────────────────────────────────────────
export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
export const MUSIC_FILES = ['focus-01.mp3', 'tension-01.mp3', 'ambient-01.mp3'];
export const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';

export const FORMATS = FORMAT_TEMPLATES; // alias for backward compatibility

export const DEFAULT_TTS_VOICE_PROFILE: TTSVoiceProfile = {
  voice: 'Orus',
  directorNotes: `
### DIRECTOR'S NOTES
Style: Crisp, authoritative narrator. Tension from facts, not voice.
Pacing: Brisk but measured. Brief pause before key facts. Each shot reads in 2–4 seconds.
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
    instruction: 'All images must feel like a premium, high-budget UI/UX product demo (like Apple keynotes or high-end SaaS explainers).',
    imagePrefix: 'premium 2D vector flat art, clean UI mockup style, dramatic isometric perspective, limited bold color palette, clean geometric shapes, dramatic lighting, no text in image, ',
    thumbnailPrefix: 'premium 2D vector flat art, clean SaaS UI style, bold colors, high-quality, striking contrast, no text in image, ',
    imageNegative: 'text, watermark, logo, blurry, low quality, photorealistic, 3D render, stock photo, cluttered',
  },
  'dark-cinematic': {
    id: 'dark-cinematic',
    instruction: 'All images must feel like a dark, moody cinematic frame — dramatic chiaroscuro, ancient textures, and powerful solitary figures.',
    imagePrefix: 'dark cinematic photography, dramatic chiaroscuro lighting, marble statues, storm clouds, solitary figure in vast landscape, desaturated with deep blacks, film grain, no text in image, ',
    thumbnailPrefix: 'dark cinematic, dramatic chiaroscuro, powerful solitary imagery, high-quality, striking contrast, no text in image, ',
    imageNegative: 'text, watermark, logo, blurry, bright colors, cheerful, cartoon, modern technology, crowded scenes, selfie style',
  },
  tactical: {
    id: 'tactical',
    instruction: 'All images must feel like hyper-realistic tactical photography — gear close-ups, high-stakes scenarios, and functional minimalism.',
    imagePrefix: 'hyper-realistic tactical photography, matte black gear, dramatic practical lighting, shallow depth of field on equipment, moody urban environment, no text in image, ',
    thumbnailPrefix: 'hyper-realistic tactical gear, dramatic moody lighting, high-quality, striking contrast, no text in image, ',
    imageNegative: 'text, watermark, logo, blurry, low quality, cartoon, illustration, bright cheerful colors, cluttered background, AI-generated look',
  },
};

export const QUALITY_GATE_MAX_RETRIES = 2;
