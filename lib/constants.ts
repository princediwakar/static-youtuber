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

// FLUX.1 [schnell] — fast + cheap. Cloudflare's documented pricing is
// $0.000053 / 512x512 output tile + $0.00011 / step, so at this pipeline's
// 768x1344 frame (6 tiles) a full 8-step render is roughly $0.0012/image.
// Cloudflare caps steps at 8 for this model; 8 renders visibly crisper detail
// and cleaner texture (grain, halftone, engraving) than the default of 4, at
// ~2x the generation time. cloudflareAi.ts now sends the correctly-named
// `steps` field (the old code sent `num_steps`, which isn't a documented
// parameter for this model — verify your renders actually changed once this
// ships; it's possible your account was silently getting the default of 4
// this whole time).
export const CF_AI_IMAGE_MODEL = process.env.CF_AI_IMAGE_MODEL || '@cf/black-forest-labs/flux-1-schnell';
export const CF_AI_IMAGE_STEPS = Number(process.env.CF_AI_IMAGE_STEPS) || 8; // hard cap for flux-1-schnell

// Optional upgrade path: FLUX.2 [dev] (@cf/black-forest-labs/flux-2-dev) is
// Black Forest Labs' larger, non-distilled model — Cloudflare's own docs
// describe it as generating "highly realistic and detailed" images, and it's
// explicitly able to follow specific hex codes and dense material/texture
// description far more reliably than schnell, which is exactly what the
// riso-print / halftone / bas-relief / topographic styles below lean on.
// The catch is pricing: it's billed PER TILE PER STEP — $0.00041 / output
// 512x512 tile / step, no flat per-image floor. At this pipeline's 6-tile
// frame and a typical [dev]-model step count (~20), that's roughly
// $0.05/image versus ~$0.001 for schnell — a 40-60x jump, multiplied across
// 12-25 shots/video and 4 channels/day. cloudflareAi.ts already knows how to
// call it (it needs multipart/form-data, not JSON) — flip the env var below
// to try it on one channel first and check the bill before rolling it out
// everywhere:
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
export const CAPTION_MAX_CHARS = 80;

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
// of the artwork instead of a generic bold-sans overlay. `fontFamily` here is
// the exact family string that will show up in `fc-list` once
// modal/render.py's image build downloads and instances these fonts — see
// that file's `image = modal.Image...` block, which now fetches all four
// variable fonts and uses fonttools to cut static weights out of them,
// matching the values below exactly. `fontFile` is the resulting filename
// inside that same build. If anything else also burns text onto frames
// locally (e.g. thumbnailGenerator.ts, which wasn't shared) it would need
// its own copy of these .ttf files under assets/fonts/ — download the
// family from fonts.google.com for that case, since that path doesn't go
// through modal/render.py's build.
//
// `maxCharsPerLine`/`maxChars` are NOT copy-pasted from CAPTION_MAX_CHARS_
// PER_LINE/CAPTION_MAX_CHARS above — those were tuned for Montserrat, and a
// condensed stencil face fits meaningfully more characters per line than a
// wide display serif at the same point size. These were derived by actually
// loading each static instance with fontTools, computing a frequency-
// weighted average glyph width (English letter frequencies + inter-word
// spaces, not a flat a-z average), and scaling Montserrat's existing tuned
// 32/80 by the ratio of that average width to Montserrat's — so whatever
// real-world slack was already baked into 32/80 (kerning, hinting, the
// video's actual safe margins) carries over proportionally instead of being
// replaced by a from-scratch geometric guess. Re-run that measurement if the
// per-niche fonts ever change:
//   Montserrat (baseline)                          ratio 1.000  32 / 80
//   Space Grotesk        (tech-minimalist)         ratio 1.083  34 / 85
//   Fraunces 72pt Black  (finance-editorial)        ratio 1.134  36 / 90
//   Cinzel Black         (stoic-zen)                ratio 0.923  29 / 72
//   Big Shoulders Stencil Display (survival-technical) ratio 1.510  48 / 120
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
    textColor: '#F3EFE6',
    strokeColor: '#1B2A4A',
    accentColor: '#FF6B35',
    maxCharsPerLine: 34,
    maxChars: 85,
  },
  'finance-editorial': {
    // Google's Fraunces ships as a variable font only; instancing it to a
    // static wght=900/opsz=72 face (see modal/render.py's image build)
    // folds those axis values into the family name itself — fontTools
    // reports the resulting family as "Fraunces 72pt Black", not "Fraunces".
    fontFamily: 'Fraunces 72pt Black',
    fontFile: 'Fraunces-Black.ttf',
    textColor: '#E8E3D8',
    strokeColor: '#14151A',
    accentColor: '#C81D25',
    maxCharsPerLine: 36,
    maxChars: 90,
  },
  'stoic-zen': {
    // Same story as Fraunces above: instancing Cinzel's variable font to
    // wght=900 produces a static face named "Cinzel Black", not "Cinzel".
    fontFamily: 'Cinzel Black',
    fontFile: 'Cinzel-Black.ttf',
    textColor: '#EDE3D0',
    strokeColor: '#2B2A28',
    accentColor: '#B5624B',
    maxCharsPerLine: 29,
    maxChars: 72,
  },
  'survival-technical': {
    // The Google Fonts family is "Big Shoulders Stencil Display" (there's
    // also a separate "...Stencil Text" sibling) — its wght=700 named
    // instance keeps the plain family name with a real "Bold" subfamily.
    fontFamily: 'Big Shoulders Stencil Display',
    fontFile: 'BigShouldersStencilDisplay-Bold.ttf',
    textColor: '#D8CBA3',
    strokeColor: '#1C1C1A',
    accentColor: '#A8501D',
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

// ─── Niche profiles ───────────────────────────────────────────────────────────
export type NicheProfile = {
  aestheticId: string;
  toneInstruction: string;
  minQualityScore: number;
};

export const NICHE_PROFILES: Record<string, NicheProfile> = {
  'SaaS & AI Tools': {
    aestheticId: 'tech-minimalist',
    toneInstruction: `You are a master storyteller chronicling the raw human drama behind the world's most insane startup bets. Every story is about a real person who bet everything on an idea that sounded crazy — and either won or nearly destroyed themselves trying.

Paint the founder as a character you can feel: an immigrant sleeping on an air mattress, a college dropout coding from a shared bedroom, a founder rejected by every investor in the room. Their obsession. Their breaking point. The exact moment it all hinged on one decision.

Name exact dates, exact dollar amounts, exact names. The pitch meeting where the investor said no. The email that changed everything. The day they almost ran out of money.

Build tension like a thriller. End with the outcome — but don't just state the valuation. Answer: what did this teach us about how the world actually works?

NEVER use "disrupt", "innovate", "unicorn", or "game-changer".
NEVER sound like a press release. The facts should hit like a gut punch.`,
    minQualityScore: 7,
  },
  'Financial Forensics': {
    aestheticId: 'finance-editorial',
    toneInstruction: `Your tone is grave, obsessive, and forensically precise — like the journalist who broke Enron, a detective staring at the smoking gun, or the SEC investigator who stayed up all night following the money. These are stories of staggering greed, delusion, and the specific moment it all collapsed.

The numbers alone should shock. $4.7 million lost to a comma. $64 billion that never existed. A bank bankrupted by a single rogue trader. Build tension through the scale and the specificity: the exact trade, the forged signature, the meeting where someone should have asked the question but didn't.

Humanize the perpetrators without excusing them. What made them believe they'd get away with it? At what point did they know it was over?

NEVER use "mind-blowing", "insane", or "unbelievable".
Let the facts speak — the dollar amounts, the dates, the paper trail. Every number is a body blow.`,
    minQualityScore: 6,
  },
  'Stoic Philosophy': {
    aestheticId: 'stoic-zen',
    toneInstruction: `Your tone is deep, unflinching, and earned — like a warrior who has endured the worst life threw at him and emerged with clarity, not bitterness. Speak like Marcus Aurelius writing to himself in his tent after a battle, or Viktor Frankl finding meaning in a concentration camp. Every word carries weight. Every sentence lands like a verdict.

Apply ancient Stoic principles directly to modern struggles: losing your job, a breakup, social media envy, betrayal by a friend, the fear of not being good enough. The Stoics faced all of this — the details changed, the human condition did not.

Contrast the weak man's response (whining, blaming, avoiding) with the disciplined man's response (accepting what he cannot control, focusing on what he can, finding dignity in the struggle). Be cold, be hard, be precise. No fluff. No comfort. Just the truth.

NEVER sound like an Instagram quote. NEVER use "vibes", "manifest", "energy", or "the universe".
This is not inspiration. This is a sword being sharpened.`,
    minQualityScore: 6,
  },
  'Urban Survival': {
    aestheticId: 'survival-technical',
    toneInstruction: `Your tone is authoritative, direct, and genuinely useful — like a mentor who
has been through it all and is sharing hard-won wisdom for surviving modern life.
Cover the full spectrum: physical emergencies (house fires, car crashes, medical
crises), financial and career survival (navigating insurance, startup failure,
negotiation), and mental resilience (growth mindset, meditation, focus).

Every tip must be practical and actionable by an average person with no special
gear or training. No doomsday scenarios, no prepper fantasies, no conspiracies.

Build tension through real stakes — the 3-minute window to escape a house fire,
the 15-second countdown in a sinking car, the 5-minute race to inject epinephrine,
the financial cliff a startup founder faces when runway hits zero.

NEVER sound alarmist, conspiratorial, or like a motivational Instagram post.
Be the calm, credible voice of someone who has seen the worst and knows
exactly what to do — whether that's performing CPR, negotiating a raise, or
sitting in silence for 10 minutes to reset your nervous system.`,
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
//
// Deliberately moved off the AI-generated-content defaults that have become
// visual shorthand for "made with an image model" — glassmorphism, glossy
// soft-3D renders, isometric paper-craft dioramas, generic ink-wash zen. Each
// world below leans on a real, physical print/material process instead, with
// an explicit, named 3-4 color palette baked directly into the prompt (FLUX
// follows concrete material + light + color description far more reliably
// than abstract style-name-dropping alone). Every prefix still ends with a
// hard no-text instruction — that part must never be softened, since FLUX
// reliably mangles any legible text it attempts.
export const AESTHETICS: Record<string, Aesthetic> = {
  'tech-minimalist': {
    id: 'tech-minimalist',
    instruction: 'Describe a bold, flat-color screen-printed concept: think independent tech zine covers and risograph poster art — not glossy 3D renders or glass panels.',
    imagePrefix: 'A flat-color risograph-style screen print illustration. Exactly three spot-ink colors: deep ink-navy, warm riso-orange, and chalk-white paper, with visible fine paper grain, a slight ink-registration offset, and coarse halftone dot shading in the shadows. Bold geometric shapes, confident flat perspective, generous negative space. Absolutely no glassmorphism, no frosted glass, no glossy 3D render, no soft gradient blur, no isometric diorama. No text, letters, numbers, or typography of any kind anywhere in the image. ',
    thumbnailPrefix: 'A bold risograph screen-print poster illustration. Three flat spot-ink colors only — ink-navy, riso-orange, chalk-white — with visible paper grain and halftone shading. Strong asymmetrical composition with a large clean void on one side for text overlay. No glassmorphism, no glossy 3D, no gradients. No text, letters, or numbers anywhere. ',
  },
  'finance-editorial': {
    id: 'finance-editorial',
    instruction: 'Describe a high-contrast investigative-journalism concept: think leaked case files and grainy wire-service photographs — not clean isometric infographics.',
    imagePrefix: 'A high-contrast black-and-white photograph rendered in coarse newsprint halftone dot texture, like a grainy wire-service photo from a leaked case file. Near-black ink and bone-white dominate, with exactly one damning accent of deep sirens-red used sparingly on a single object. Hard directional light, deep shadows, visible film grain and dust. May suggest confidential paperwork with plain blank redaction bars and blank stamped corners. Absolutely no isometric illustration, no flat vector paper-craft, no clean infographic style. No text, letters, numbers, or typography anywhere in the image — any bars or stamps must stay completely blank, never legible. ',
    thumbnailPrefix: 'A stark black-and-white halftone photograph in leaked-dossier style, near-black and bone-white with a single sharp accent of sirens-red on one element. Hard shadows, visible grain. Large blank void on one side for overlay. No isometric illustration, no flat vector style. No text, letters, or numbers anywhere. ',
  },
  'stoic-zen': {
    id: 'stoic-zen',
    instruction: 'Describe a monumental sculptural concept: think weathered Roman bas-relief and cast bronze — not ink-wash calligraphy.',
    imagePrefix: 'A weathered bas-relief carving in warm travertine stone and oxidized bronze — terracotta, aged-bronze, and charcoal shadow with warm ivory highlights. Low raking light from one side casts long, sharp shadows across deeply chiseled forms. Cracked stone texture, patina, fragments of columns. Absolutely no ink-wash brushstroke, no sumi-e, no soft watercolor, no flat vector. No text, letters, symbols, or characters anywhere in the image — any inscriptions must be worn smooth and illegible. ',
    thumbnailPrefix: 'A dramatic weathered bronze and stone bas-relief, terracotta and charcoal tones, raking warm light casting hard shadows across chiseled forms. Bold asymmetrical composition with a large blank void for overlay. No ink-wash, no sumi-e, no flat vector. No text or characters anywhere. ',
  },
  'survival-technical': {
    id: 'survival-technical',
    instruction: 'Describe a vintage military field-manual concept: think aged topographic maps and hand-drawn cross-section diagrams — not sleek tech wireframes.',
    imagePrefix: 'An aged field-manual illustration on weathered khaki paper, printed in olive-drab, rust-orange, and ink-black. Fine contour lines like a topographic map, cross-hatched shading, hand-drawn technical cross-sections, worn creases and stains on the paper. Absolutely no sleek wireframe render, no glossy 3D blueprint, no neon UI lines. No text, letters, numbers, or labels anywhere in the image — map contours and stencil marks must stay blank shapes, never legible. ',
    thumbnailPrefix: 'A bold vintage field-manual illustration: topographic contour lines and cross-hatched shading in olive-drab, rust-orange, and ink-black on aged khaki paper. Aggressively asymmetrical composition, large blank void for overlay. No sleek wireframe, no glossy 3D. No text, letters, numbers, or labels anywhere. ',
  },
};

export const QUALITY_GATE_MAX_RETRIES = 4;