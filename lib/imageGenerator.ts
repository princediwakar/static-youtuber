// Path: lib/imageGenerator.ts
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { existsSync } from 'fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { Slide, AccountCredentials } from './types';
import { uploadSlideImage } from './cloudinary';
import {
  IMAGE_MODEL,
  IMAGE_ASPECT_RATIO,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  CAPTION_FONT_SIZE,
  CAPTION_MAX_CHARS_PER_LINE,
  CAPTION_Y_POSITION,
  CAPTION_LINE_HEIGHT,
  FONT_PATH,
} from './constants';

// Register Devanagari font at module load so canvas can render Hindi text.
// librsvg (sharp's SVG renderer) does not support @font-face, so we bypass it
// entirely by rendering text via Skia canvas and compositing the result.
const FONT_FAMILY = (() => {
  if (existsSync(FONT_PATH)) {
    try {
      GlobalFonts.registerFromPath(FONT_PATH, 'Noto Sans Devanagari');
      return 'Noto Sans Devanagari';
    } catch {
      console.warn('[burnCaption] Font registration failed, falling back to sans-serif');
    }
  }
  return 'sans-serif';
})();

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

// ─── Caption helpers ──────────────────────────────────────────────────────────

/** Word-wrap text into lines of max N characters, breaking on word boundaries */
function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Kinetic typography — power word detection ────────────────────────────────

/** Words that get highlighted in golden yellow with a glow effect */
const POWER_WORDS = new Set([
  // Superlatives & absolutes
  'most', 'largest', 'oldest', 'deadliest', 'first', 'last', 'only',
  'greatest', 'biggest', 'smallest', 'fastest', 'strongest', 'worst',
  'richest', 'poorest', 'longest', 'shortest',
  // Emotional / curiosity triggers
  'never', 'secret', 'secrets', 'shocking', 'terrifying', 'impossible',
  'forbidden', 'hidden', 'lost', 'ancient', 'mysterious', 'unknown',
  'deadly', 'powerful', 'destroyed', 'vanished', 'cursed', 'sacred',
  'unstoppable', 'legendary', 'forgotten', 'ruthless', 'brutal',
  // Negation / contrast
  'nobody', 'nothing', 'everywhere', 'everyone', 'always',
  // MrBeast-style urgency & action words
  'insane', 'crazy', 'mind-blowing', 'suddenly', 'boom', 'wait', 'watch',
  'unbelievable', 'insanity', 'warning', 'stop', 'go', 'now',
  'again', 'dark', 'truth', 'exposed', 'revealed', 'untold',
]);

/** Detect which words in a line should be highlighted */
function detectPowerWords(word: string): boolean {
  const clean = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  // Numbers (e.g., "9,000", "8,000", "300")
  if (/\d+/.test(word)) return true;
  // ALL CAPS words with 3+ letters (script emphasis markers)
  if (word.length >= 3 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) return true;
  // Known power words
  return POWER_WORDS.has(clean);
}

const HIGHLIGHT_COLOR = '#FFD700'; // Golden yellow (used as stroke on black fill)
const HIGHLIGHT_FONT_SCALE = 1.30; // MrBeast-style: in-your-face power words
const TEXT_FILL = '#000000';       // Black fill — readable on white/light cartoon backgrounds
const TEXT_STROKE = '#FFFFFF';     // White stroke for contrast on any background

/**
 * Composite a caption overlay onto the image buffer with kinetic typography.
 * Renders text via Skia canvas (bypassing librsvg's lack of @font-face support),
 * then composites the rendered text layer onto the image with sharp.
 */
export async function burnCaption(imageBuffer: Buffer, text: string): Promise<Buffer> {
  const lines = wrapText(text, CAPTION_MAX_CHARS_PER_LINE);
  const totalTextHeight = lines.length * CAPTION_LINE_HEIGHT;
  const centerY = Math.round(VIDEO_HEIGHT * CAPTION_Y_POSITION);
  const startY = centerY - Math.round(totalTextHeight / 2) + CAPTION_FONT_SIZE;
  const highlightFontSize = Math.round(CAPTION_FONT_SIZE * HIGHLIGHT_FONT_SCALE);

  const canvas = createCanvas(VIDEO_WIDTH, VIDEO_HEIGHT);
  const ctx = canvas.getContext('2d');

  const normalFont = `bold ${CAPTION_FONT_SIZE}px "${FONT_FAMILY}", sans-serif`;
  ctx.font = normalFont;
  const spaceWidth = ctx.measureText(' ').width;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const y = startY + lineIdx * CAPTION_LINE_HEIGHT;
    const words = line.split(' ');

    // Measure all words to compute centered starting X
    const wordWidths: number[] = [];
    let totalWordWidth = 0;
    for (const word of words) {
      const isHighlighted = detectPowerWords(word);
      ctx.font = `bold ${isHighlighted ? highlightFontSize : CAPTION_FONT_SIZE}px "${FONT_FAMILY}", sans-serif`;
      const w = ctx.measureText(word).width;
      wordWidths.push(w);
      totalWordWidth += w;
    }

    const totalLineWidth = totalWordWidth + spaceWidth * (words.length - 1);
    let x = Math.round((VIDEO_WIDTH - totalLineWidth) / 2);

    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';

    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      const isHighlighted = detectPowerWords(word);
      ctx.font = `bold ${isHighlighted ? highlightFontSize : CAPTION_FONT_SIZE}px "${FONT_FAMILY}", sans-serif`;

      if (isHighlighted) {
        ctx.save();
        ctx.shadowColor = HIGHLIGHT_COLOR;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = HIGHLIGHT_COLOR;
        ctx.fillStyle = TEXT_FILL;
      } else {
        ctx.strokeStyle = TEXT_STROKE;
        ctx.fillStyle = TEXT_FILL;
      }

      ctx.strokeText(word, x, y);
      ctx.fillText(word, x, y);

      if (isHighlighted) {
        ctx.restore();
      }

      x += wordWidths[wi] + spaceWidth;
    }
  }

  const textOverlay = canvas.toBuffer('image/png');

  return sharp(imageBuffer)
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, { fit: 'cover', position: 'centre' })
    .composite([{ input: textOverlay, blend: 'over' }])
    .png({ quality: 100, compressionLevel: 1 })
    .toBuffer();
}

// ─── Image generation ─────────────────────────────────────────────────────────

async function generateSingleImage(prompt: string): Promise<Buffer> {
  const client = getClient();

  const response = await client.models.generateImages({
    model: IMAGE_MODEL,
    prompt,
    config: {
      aspectRatio: IMAGE_ASPECT_RATIO,
      numberOfImages: 1,
    },
  });

  const imageData = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageData) {
    const safety = response.generatedImages?.[0]?.safetyAttributes;
    const reason = safety ? JSON.stringify(safety) : 'no image data in response';
    throw new Error(`Imagen returned no image data: ${reason}`);
  }

  const rawBuffer = Buffer.from(imageData, 'base64');

  return sharp(rawBuffer)
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, { fit: 'cover', position: 'centre' })
    .png({ quality: 100, compressionLevel: 1 })
    .toBuffer();
}

async function withConcurrencyLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<string>
): Promise<string[]> {
  const results: string[] = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

