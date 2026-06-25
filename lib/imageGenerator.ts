// Path: lib/imageGenerator.ts
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { existsSync } from 'fs';
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

/** Escape XML special characters for safe embedding in SVG */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

const HIGHLIGHT_COLOR = '#FFD700'; // Golden yellow — matches "golden-hour" image style
const HIGHLIGHT_FONT_SCALE = 1.15; // 15% larger than surrounding text

/**
 * Composite a caption overlay onto the image buffer with kinetic typography.
 * Power words (numbers, superlatives, emotional words, ALL CAPS) are highlighted
 * in golden yellow with a glow effect. Other words remain white with black stroke.
 */
export async function burnCaption(imageBuffer: Buffer, text: string): Promise<Buffer> {
  const lines = wrapText(text, CAPTION_MAX_CHARS_PER_LINE);
  const totalTextHeight = lines.length * CAPTION_LINE_HEIGHT;
  const centerY = Math.round(VIDEO_HEIGHT * CAPTION_Y_POSITION);
  const startY = centerY - Math.round(totalTextHeight / 2) + CAPTION_FONT_SIZE;

  const fontFamily = existsSync(FONT_PATH)
    ? `url('${FONT_PATH}')`
    : 'sans-serif';

  const fontFaceDecl = existsSync(FONT_PATH)
    ? `@font-face { font-family: 'Montserrat'; src: ${fontFamily}; font-weight: bold; }`
    : '';

  const fontName = existsSync(FONT_PATH) ? 'Montserrat' : 'sans-serif';
  const highlightFontSize = Math.round(CAPTION_FONT_SIZE * HIGHLIGHT_FONT_SCALE);

  const textElements = lines
    .map((line, i) => {
      const y = startY + i * CAPTION_LINE_HEIGHT;
      const words = line.split(' ');

      // Build tspan elements per word — highlighted words get golden fill + glow
      const tspans = words
        .map((word, wi) => {
          const escaped = escapeXml(word);
          const isHighlighted = detectPowerWords(word);
          const space = wi === 0 ? '' : '&#160;';

          if (isHighlighted) {
            return `<tspan fill="${HIGHLIGHT_COLOR}" font-size="${highlightFontSize}" filter="url(#glow)">${space}${escaped}</tspan>`;
          }
          return `<tspan>${space}${escaped}</tspan>`;
        })
        .join('');

      return `
        <text
          x="${VIDEO_WIDTH / 2}"
          y="${y}"
          text-anchor="middle"
          font-size="${CAPTION_FONT_SIZE}"
          font-family="${fontName}"
          font-weight="bold"
          fill="white"
          stroke="black"
          stroke-width="4"
          stroke-linejoin="round"
          paint-order="stroke fill"
        >${tspans}</text>`;
    })
    .join('\n');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}">
      <defs>
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feFlood flood-color="${HIGHLIGHT_COLOR}" flood-opacity="0.6" result="color"/>
          <feComposite in="color" in2="blur" operator="in" result="shadow"/>
          <feMerge>
            <feMergeNode in="shadow"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <style>${fontFaceDecl}</style>
      ${textElements}
    </svg>`;

  return sharp(imageBuffer)
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
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

