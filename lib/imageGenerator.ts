// Path: lib/imageGenerator.ts
import sharp from 'sharp';
import { existsSync } from 'fs';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import {
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  CAPTION_FONT_SIZE,
  CAPTION_MAX_CHARS_PER_LINE,
  CAPTION_Y_POSITION,
  CAPTION_LINE_HEIGHT,
  FONT_PATH,
} from './constants';

const FONT_FAMILY = (() => {
  if (existsSync(FONT_PATH)) {
    try {
      GlobalFonts.registerFromPath(FONT_PATH, 'Montserrat');
      return 'Montserrat';
    } catch {
      console.warn('[burnCaption] Font registration failed, falling back to sans-serif');
    }
  }
  return 'sans-serif';
})();

// ─── Caption helpers ──────────────────────────────────────────────────────────

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

// ─── Kinetic typography ───────────────────────────────────────────────────────

const POWER_WORDS = new Set([
  'most', 'largest', 'oldest', 'deadliest', 'first', 'last', 'only',
  'greatest', 'biggest', 'smallest', 'fastest', 'strongest', 'worst',
  'richest', 'poorest', 'longest', 'shortest',
  'never', 'secret', 'secrets', 'shocking', 'terrifying', 'impossible',
  'forbidden', 'hidden', 'lost', 'ancient', 'mysterious', 'unknown',
  'deadly', 'powerful', 'destroyed', 'vanished', 'cursed', 'sacred',
  'unstoppable', 'legendary', 'forgotten', 'ruthless', 'brutal',
  'nobody', 'nothing', 'everywhere', 'everyone', 'always',
  'insane', 'crazy', 'mind-blowing', 'suddenly', 'boom', 'wait', 'watch',
  'unbelievable', 'insanity', 'warning', 'stop', 'go', 'now',
  'again', 'dark', 'truth', 'exposed', 'revealed', 'untold',
]);

function detectPowerWords(word: string): boolean {
  const clean = word.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (/\d+/.test(word)) return true;
  if (word.length >= 3 && word === word.toUpperCase() && /^[A-Z]+$/.test(word)) return true;
  return POWER_WORDS.has(clean);
}

const HIGHLIGHT_COLOR = '#FFD700';
const HIGHLIGHT_FONT_SCALE = 1.30;
const TEXT_FILL = '#000000';
const TEXT_STROKE = '#FFFFFF';
const SAFE_ZONE_WIDTH = VIDEO_WIDTH - 120; // 60px safe margin on both sides

export async function burnCaption(imageBuffer: Buffer, text: string): Promise<Buffer> {
  const lines = wrapText(text, CAPTION_MAX_CHARS_PER_LINE);
  const totalTextHeight = lines.length * CAPTION_LINE_HEIGHT;
  const centerY = Math.round(VIDEO_HEIGHT * CAPTION_Y_POSITION);
  const startY = centerY - Math.round(totalTextHeight / 2) + CAPTION_FONT_SIZE;
  const highlightFontSize = Math.round(CAPTION_FONT_SIZE * HIGHLIGHT_FONT_SCALE);

  const canvas = createCanvas(VIDEO_WIDTH, VIDEO_HEIGHT);
  const ctx = canvas.getContext('2d');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx];
    const y = startY + lineIdx * CAPTION_LINE_HEIGHT;
    const words = line.split(' ');

    const wordWidths: number[] = [];
    let totalWordWidth = 0;

    // Pass 1: Measure baseline text width
    for (const word of words) {
      const isHighlighted = detectPowerWords(word);
      ctx.font = `bold ${isHighlighted ? highlightFontSize : CAPTION_FONT_SIZE}px "${FONT_FAMILY}", sans-serif`;
      const w = ctx.measureText(word).width;
      wordWidths.push(w);
      totalWordWidth += w;
    }

    ctx.font = `bold ${CAPTION_FONT_SIZE}px "${FONT_FAMILY}", sans-serif`;
    const spaceWidth = ctx.measureText(' ').width;
    const totalLineWidth = totalWordWidth + spaceWidth * (words.length - 1);

    // DYNAMIC SCALING: Prevent text from bleeding off the screen
    let scale = 1;
    if (totalLineWidth > SAFE_ZONE_WIDTH) {
      scale = SAFE_ZONE_WIDTH / totalLineWidth;
    }

    let x = Math.round((VIDEO_WIDTH - (totalLineWidth * scale)) / 2);

    ctx.lineWidth = 4 * scale;
    ctx.lineJoin = 'round';

    // Pass 2: Render with scaled constraints
    for (let wi = 0; wi < words.length; wi++) {
      const word = words[wi];
      const isHighlighted = detectPowerWords(word);
      const currentFontSize = isHighlighted ? highlightFontSize * scale : CAPTION_FONT_SIZE * scale;
      ctx.font = `bold ${currentFontSize}px "${FONT_FAMILY}", sans-serif`;

      if (isHighlighted) {
        ctx.save();
        ctx.shadowColor = HIGHLIGHT_COLOR;
        ctx.shadowBlur = 8 * scale;
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

      x += (wordWidths[wi] + spaceWidth) * scale;
    }
  }

  const textOverlay = canvas.toBuffer('image/png');

  return sharp(imageBuffer)
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, { fit: 'cover', position: 'centre' })
    .composite([{ input: textOverlay, blend: 'over' }])
    .png({ quality: 100, compressionLevel: 1 })
    .toBuffer();
}
