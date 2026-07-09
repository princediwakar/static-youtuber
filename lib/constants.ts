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


// ─── Format templates ───────────────────────────────────────────────────────────
export const FORMAT_TEMPLATES = ['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST', 'DEEP_DIVE'] as const;
export type FormatTemplate = typeof FORMAT_TEMPLATES[number];

export const FORMAT_TEMPLATE_WEIGHTS: Record<string, Record<FormatTemplate, number>> = {
  'SaaS & AI Tools':     { RAPID_FIRE: 0.1, SLOW_BURN: 0.7, THE_LIST: 0.2, DEEP_DIVE: 0 },
  'Financial Forensics': { RAPID_FIRE: 0.8, SLOW_BURN: 0.2, THE_LIST: 0,   DEEP_DIVE: 0 },
  'Stoic Philosophy':    { RAPID_FIRE: 0,   SLOW_BURN: 0.7, THE_LIST: 0.3, DEEP_DIVE: 0 },
  'Urban Survival':      { RAPID_FIRE: 0,   SLOW_BURN: 0.6, THE_LIST: 0.4, DEEP_DIVE: 0 },
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
  'tech-minimalist': {
    fontFamily: 'Space Grotesk',
    fontFile: 'SpaceGrotesk-Bold.ttf',
    textColor: '#1A1A1A',
    strokeColor: '#EAEAEA',
    accentColor: '#0055A4',
    maxCharsPerLine: 34,
    maxChars: 85,
  },
  'finance-editorial': {
    fontFamily: 'Fraunces 72pt Black',
    fontFile: 'Fraunces-Black.ttf',
    textColor: '#F0EDE6',
    strokeColor: '#1C1917',
    accentColor: '#4A0E17',
    maxCharsPerLine: 36,
    maxChars: 90,
  },
  'stoic-zen': {
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
  'survival-technical': {

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
  'tech-minimalist':    { ...CAPTION_STYLES['tech-minimalist'],    maxCharsPerLine: 58, maxChars: 145, maxWords: 20 },
  'finance-editorial':  { ...CAPTION_STYLES['finance-editorial'],  maxCharsPerLine: 60, maxChars: 150, maxWords: 20 },
  'stoic-zen':          { ...CAPTION_STYLES['stoic-zen'],          maxCharsPerLine: 48, maxChars: 120, maxWords: 20 },
  'survival-technical': { ...CAPTION_STYLES['survival-technical'], maxCharsPerLine: 80, maxChars: 200, maxWords: 20 },
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
  'SaaS & AI Tools': {
    aestheticId: 'tech-minimalist',
    minQualityScore: 5,
    toneInstruction: `You are a documentary narrator chronicling the raw human drama behind the world's most consequential startup bets. Your audience has chosen to spend 4 minutes with you — reward that with depth.

Write in full paragraphs with flowing sentences (15–25 words). Use subordinate clauses, cause-and-effect transitions, and narrative callbacks. Structure: Hook → Background Context → Pivotal Conflict → Resolution → Modern Significance.

Include exact dates, dollar amounts, and names from the research context. Build tension through accumulating detail. Make the psychological burden of leadership palpable, but emphasize the sheer willpower required to push through. The ending must recontextualize the entire story into an empowering lesson.

NEVER use "disrupt", "innovate", "unicorn", or "game-changer". NEVER sound like a press release.
Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'Financial Forensics': {
    aestheticId: 'finance-editorial',
    minQualityScore: 5,
    toneInstruction: `You are the investigative journalist who broke Enron, reconstructing a financial crime scene for an audience willing to follow every thread. Your tone is grave, forensically precise, and methodical.

Write in flowing paragraphs, 15–25 words per sentence. Use transitions that build a chronological evidence trail. Structure: The Revelation → The Setup → The Paper Trail → The Collapse → The Reckoning.

Every number is a body blow — the exact trade, the forged signature, the meeting where someone should have asked the question but didn't. Zero in on the cognitive dissonance and psychological unraveling of the perpetrators, using their failure as an empowering lesson on integrity and the true cost of deceit.

NEVER use "mind-blowing", "insane", or "unbelievable". Let the facts speak.
Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'Stoic Philosophy': {
    aestheticId: 'stoic-zen',
    minQualityScore: 5,
    toneInstruction: `You are Marcus Aurelius writing to himself after a decade of war — earned wisdom, not motivational platitude. Your audience has given you 4 minutes; give them something they'll carry.

Write in measured paragraphs, 15–25 words per sentence. Speak to the modern man feeling crushed by expectations. Use contrast (the weak response vs the disciplined response), historical anchoring, and direct address to the modern struggle. The advice should feel like a cold splash of water: harsh, bracing, but ultimately liberating and deeply empowering. Structure: The Principle → Its Ancient Origin → Its Modern Manifestation → The Practice → The Verdict.

NEVER sound like an Instagram quote. NEVER use "vibes", "manifest", "energy", or "the universe".
Do not trail off or repeat yourself at the end. End decisively.`,
  },
  'Urban Survival': {
    aestheticId: 'survival-technical',
    minQualityScore: 5,
    toneInstruction: `You are the calm, credible mentor who has been through the worst and is sharing hard-won knowledge for 4 minutes.

Write in clear, authoritative paragraphs, 15–25 words per sentence. Every claim must be actionable. Frame every lesson around the fatal mistake most people make when panic sets in. Use the ticking-clock structure for urgency. Your advice is the difference between living and dying. Empower the viewer: they don't need to be afraid if they are prepared. Structure: The Scenario → Why Most People Get It Wrong → The Correct Protocol → The Underlying Principle → How to Train for It.

NEVER sound alarmist, conspiratorial, or like a motivational Instagram post.
Do not trail off or repeat yourself at the end. End decisively.`,
  },
};

export const NICHE_PROFILES: Record<string, NicheProfile> = {
  'SaaS & AI Tools': {
    aestheticId: 'tech-minimalist',
    toneInstruction: `You are a master storyteller chronicling the raw human drama behind the world's most insane startup bets. Every story is about a real person who bet everything on an idea that sounded crazy — and either won or nearly destroyed themselves trying.

Paint the founder as a character you can feel: an immigrant sleeping on an air mattress, a college dropout coding from a shared bedroom, a founder rejected by every investor in the room. Their obsession. Their breaking point. The exact moment it all hinged on one decision.

Name exact dates, exact dollar amounts, exact names. The pitch meeting where the investor said no. The email that changed everything. The day they almost ran out of money.

Build tension like a thriller. Make the stakes visceral: emphasize the terrifying risk of failure, but focus on the sheer willpower it took to overcome it. End with the outcome — but don't just state the valuation. Answer: what empowering truth did this teach us about human potential?

NEVER use "disrupt", "innovate", "unicorn", or "game-changer".
NEVER sound like a press release. The facts should hit like a gut punch.
Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
  },
  'Financial Forensics': {
    aestheticId: 'finance-editorial',
    toneInstruction: `Your tone is grave, obsessive, and forensically precise — like the journalist who broke Enron, a detective staring at the smoking gun, or the SEC investigator who stayed up all night following the money. These are stories of staggering greed, delusion, and the specific moment it all collapsed.

The numbers alone should shock. $4.7 million lost to a comma. $64 billion that never existed. A bank bankrupted by a single rogue trader. Build tension through the scale and the specificity: the exact trade, the forged signature, the meeting where someone should have asked the question but didn't.

Humanize the perpetrators without excusing them. Zero in on their psychological unraveling. Describe the sweat, the panic, and the exact moment the house of cards began to fall. What made them believe they'd get away with it? The story should empower the viewer by demystifying the complex mechanisms of greed and revealing the fragile human ego underneath it all.

NEVER use "mind-blowing", "insane", or "unbelievable".
Let the facts speak — the dollar amounts, the dates, the paper trail. Every number is a body blow.
Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
  },
  'Stoic Philosophy': {
    aestheticId: 'stoic-zen',
    toneInstruction: `Your tone is deep, unflinching, and earned — like a warrior who has endured the worst life threw at him and emerged with clarity, not bitterness. Speak like Marcus Aurelius writing to himself in his tent after a battle, or Viktor Frankl finding meaning in a concentration camp. Every word carries weight. Every sentence lands like a verdict.

Speak to the modern man feeling crushed by expectations, anxiety, and digital noise. Apply ancient Stoic principles directly to modern struggles: losing your job, a breakup, social media envy, betrayal by a friend, the fear of not being good enough. The Stoics faced all of this — the details changed, the human condition did not. The advice should feel like a cold splash of water: harsh, bracing, but ultimately liberating and profoundly empowering.

Contrast the weak man's response (whining, blaming, avoiding) with the disciplined man's response (accepting what he cannot control, focusing on what he can, finding dignity in the struggle). Be cold, be hard, be precise. No fluff. No comfort. Just the truth.

NEVER sound like an Instagram quote. NEVER use "vibes", "manifest", "energy", or "the universe".
This is not inspiration. This is a sword being sharpened.
Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
  },
  'Urban Survival': {
    aestheticId: 'survival-technical',
    toneInstruction: `Your tone is authoritative, direct, and genuinely useful — like a mentor who
has been through it all and is sharing hard-won wisdom for surviving modern life.
Cover the full spectrum: physical emergencies (house fires, car crashes, medical
crises), financial and career survival (navigating insurance, startup failure,
negotiation), and mental resilience (growth mindset, meditation, focus).

Every tip must be practical and actionable by an average person with no special
gear or training. Frame every lesson around the fatal mistake most people make when panic sets in. No doomsday scenarios, no prepper fantasies, no conspiracies.

Build tension through real stakes — the 3-minute window to escape a house fire,
the 15-second countdown in a sinking car, the 5-minute race to inject epinephrine,
the financial cliff a startup founder faces when runway hits zero. Your advice is the difference between living and dying. Empower the viewer to realize they are capable of surviving the worst if they remain calm and prepared.

NEVER sound alarmist, conspiratorial, or like a motivational Instagram post.
Be the calm, credible voice of someone who has seen the worst and knows
exactly what to do — whether that's performing CPR, negotiating a raise, or
sitting in silence for 10 minutes to reset your nervous system.
Do not trail off or repeat yourself at the end. End decisively.`,
    minQualityScore: 5,
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

export const AESTHETICS: Record<string, Aesthetic> = {
  'tech-minimalist': {
    id: 'tech-minimalist',
    instruction: 'Describe a high-end, mid-century industrial hardware concept: think Dieter Rams Braun designs and clean architectural blueprints — not glossy 3D renders or glass panels.',
    imagePrefix: 'A flat, high-contrast photograph of matte industrial hardware. Dieter Rams style, 1960s Braun aesthetic, Swiss design, rigid geometry, bauhaus, anodized metal, clean architectural space. Desaturated off-white and warm greys. Absolutely no cinematic lighting, no bloom, no glowing edges, no glossy reflections, no neon, no holographic, no cyberpunk, no 3D render. Stark shadows, flat light, matte finish, muted colors. No text, letters, or numbers anywhere. ',
    thumbnailPrefix: 'A stark photograph of matte industrial hardware. Dieter Rams style, 1960s Braun aesthetic, Swiss design, rigid geometry, bauhaus, anodized metal, clean architectural space. Desaturated off-white and warm greys. Strong asymmetrical composition with a large clean void on one side for text overlay. No glassmorphism, no glossy 3D, no gradients, no holographic, no cyberpunk. Matte finish, flat light. No text, letters, or numbers anywhere. ',
  },
  'finance-editorial': {
    id: 'finance-editorial',
    instruction: 'Describe an archival forensic macro concept: think physical evidence and extreme close-ups of paper — not digital trading terminals.',
    imagePrefix: 'An extreme macro photograph of physical evidence. Thick paper textures, harsh direct camera flash. Desaturated. Absolutely no digital UI, no trading terminals, no cinematic lighting, no glowing elements, no 3D renders. Flat, ugly lighting. No legible text, letters, numbers, or stamps anywhere. ',
    thumbnailPrefix: 'An extreme macro photograph of physical evidence. Thick paper textures, harsh direct camera flash. Desaturated. Large blank void on one side for overlay. Absolutely no digital UI, no trading terminals, no cinematic lighting, no glowing elements, no 3D renders. No legible text, letters, numbers, or stamps anywhere. ',
  },
  'stoic-zen': {
    id: 'stoic-zen',
    instruction: 'Describe a raw, monumental natural concept: think vast empty landscapes shot on medium format film — not epic glowing statues.',
    imagePrefix: 'A medium-format film photograph of raw natural elements. Sheer granite, driftwood, or salt flats. Overcast sky, diffuse flat light. Desaturated earthy tones. Absolutely no epic cinematic lighting, no god rays, no glowing edges, no human figures, no marble statues. Cold, stark, empty landscape. No text, letters, or symbols anywhere. ',
    thumbnailPrefix: 'A medium-format film photograph of raw natural elements. Overcast sky, diffuse flat light. Desaturated earthy tones. Bold asymmetrical composition with a large blank void for overlay. Absolutely no epic cinematic lighting, no glowing edges, no human figures, no marble statues. No text or characters anywhere. ',
  },
  'survival-technical': {
    id: 'survival-technical',
    instruction: 'Describe a stark utilitarian concept: think a single functional object on concrete shot with a direct flash — not glowing tactical HUDs.',
    imagePrefix: 'A stark, harsh flash photograph of a single utilitarian object on a scuffed concrete floor. Hard shadows, flat colors. Desaturated. Absolutely no tactical HUDs, no night vision green, no glowing elements, no cinematic lighting. Purely functional, unromanticized. No text, letters, or labels anywhere. ',
    thumbnailPrefix: 'A stark, harsh flash photograph of a single utilitarian object on a scuffed concrete floor. Hard shadows, flat colors. Desaturated. Aggressively asymmetrical composition, large blank void for overlay. Absolutely no tactical HUDs, no night vision green, no glowing elements, no cinematic lighting. No text, letters, numbers, or labels anywhere. ',
  },
};

export const QUALITY_GATE_MAX_RETRIES = 4;