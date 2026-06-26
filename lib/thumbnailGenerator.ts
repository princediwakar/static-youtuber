// Path: lib/thumbnailGenerator.ts
/**
 * thumbnailGenerator.ts
 *
 * Key improvements over the original:
 * 1. Dedicated thumbnail prompt builder — separate from slide image generation,
 *    with specific composition rules for YouTube CTR optimisation.
 * 2. Mobile-first design: high contrast, simple focal point, large readable text.
 * 3. Word-length safety: prevents captions from breaking on long geography/history terms.
 * 4. Thumbnail model stays on gemini-3.1-flash-image (Nano Banana 2) — correct for this.
 */

import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, IMAGE_MODEL_THUMBNAIL, AESTHETICS, NICHE_PROFILES, DEFAULT_NICHE_PROFILE } from './constants';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

// ─── Thumbnail prompt builder ─────────────────────────────────────────────────

/**
 * Builds a dedicated thumbnail prompt with CTR-optimised composition rules.
 *
 * YouTube thumbnail principles applied here:
 * - Single clear focal point (face > object > landscape, in CTR order)
 * - High contrast, bold colours readable at 200×112px (mobile browse size)
 * - Empty space on one side for text overlay (handled by addTextOverlay)
 * - Strong emotion or visual tension without being cluttered
 */
export function buildThumbnailPrompt(
  rawThumbnailPrompt: string,
  niche: string,
): string {
  const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const aesthetic = AESTHETICS[profile.aestheticId] ?? Object.values(AESTHETICS)[0];

  return `${aesthetic.thumbnailPrefix}${rawThumbnailPrompt}

THUMBNAIL COMPOSITION RULES (critical — follow exactly):
- Single, dominant focal point. No cluttered scenes.
- Extreme high contrast — must be readable at 200 pixels wide on a phone screen.
- Leave the lower 40% of the image relatively dark and simple — text will overlay here.
- Strong visual emotion: awe, surprise, or tension communicated through composition.
- Bold, saturated colors. No muted or pastel palettes.
- NO text, watermarks, logos, or lettering anywhere in the image.
- Avoid: ${aesthetic.imageNegative}`;
}

// ─── Caption renderer ─────────────────────────────────────────────────────────

/**
 * Word-wraps the title safely, handling long geography/history terms that
 * would previously overflow a 28-char line limit.
 *
 * Strategy:
 * - Max 24 chars per line (tighter than before for safety)
 * - Long individual words (>24 chars) get their own line without truncation
 * - Hard cap at 3 lines — anything beyond gets ellipsised
 */
function wordWrap(text: string, maxChars = 24, maxLines = 3): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (lines.length >= maxLines) break;

    // Word alone exceeds maxChars — force it on its own line
    if (word.length > maxChars) {
      if (current.trim()) lines.push(current.trim());
      if (lines.length < maxLines) lines.push(word);
      current = '';
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current.trim()) lines.push(current.trim());
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current.trim() && lines.length < maxLines) {
    lines.push(current.trim());
  }

  // If we cut lines, append ellipsis to the last one
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length + maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > maxChars - 1 ? last.substring(0, maxChars - 1) + '…' : last + '…';
  }

  return lines;
}

async function addTextOverlay(imageBuffer: Buffer, title: string): Promise<Buffer> {
  const displayTitle = title.length > 72 ? title.substring(0, 69) + '…' : title;
  const lines = wordWrap(displayTitle, 24, 3);

  const lineHeight = 76;
  const fontSize = 62;
  const totalTextHeight = lines.length * lineHeight;

  // Position text in the lower third
  const yStart = THUMBNAIL_HEIGHT * 0.68;

  const svgLines = lines.map((line, i) => {
    const y = yStart + i * lineHeight;
    // Double stroke for better contrast on both light and dark images
    return `
      <text
        x="50%"
        y="${y}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="900"
        fill="white"
        stroke="black"
        stroke-width="6"
        stroke-linejoin="round"
        paint-order="stroke"
        letter-spacing="-1"
      >${escapeXml(line)}</text>
      <text
        x="50%"
        y="${y}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial Black, Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="900"
        fill="white"
        stroke-width="0"
        letter-spacing="-1"
      >${escapeXml(line)}</text>`;
  });

  // Gradient covers the lower portion where text sits
  const gradientStartY = yStart - lineHeight * 1.5;
  const gradientHeight = totalTextHeight + lineHeight * 2.5;

  const svg = `
    <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="60%" stop-color="black" stop-opacity="0.75"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.92"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${gradientStartY}" width="${THUMBNAIL_WIDTH}" height="${gradientHeight}" fill="url(#grad)"/>
      ${svgLines.join('')}
    </svg>`;

  return sharp(imageBuffer)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .jpeg({ quality: 92 }) // JPEG instead of PNG — YouTube serves JPEG thumbnails
    .toBuffer();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Generates a thumbnail:
 * 1. Builds a CTR-optimised prompt (with niche aesthetic + composition rules)
 * 2. Calls Gemini image model at 16:9
 * 3. Resizes to 1280×720 (YouTube thumbnail spec)
 * 4. Overlays the video title as bold white text with gradient backing
 */
export async function generateThumbnail(
  title: string,
  rawThumbnailPrompt: string,
  niche: string,
): Promise<Buffer> {
  console.log(`[Thumbnail] Generating for: "${title}"`);
  const client = getClient();

  const fullPrompt = buildThumbnailPrompt(rawThumbnailPrompt, niche);

  const response = await client.models.generateContent({
    model: IMAGE_MODEL_THUMBNAIL,
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    config: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: '16:9',
      },
    },
  });

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData?.mimeType?.startsWith('image/')
  );
  const imageData = imagePart?.inlineData?.data;
  if (!imageData) throw new Error('Image model returned no thumbnail data');

  const rawBuffer = Buffer.from(imageData as string, 'base64');
  const withText = await addTextOverlay(rawBuffer, title);

  console.log(`[Thumbnail] Generated: ${(withText.length / 1024).toFixed(0)} KB`);
  return withText;
}