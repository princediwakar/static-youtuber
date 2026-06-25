// Path: lib/imageGenerator.ts
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { existsSync } from 'fs';
import { Slide, AccountCredentials } from './types';
import { uploadSlideImage } from './cloudinary';
import {
  IMAGEN_MODEL,
  IMAGEN_ASPECT_RATIO,
  IMAGE_CONCURRENCY,
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

/**
 * Composite a caption overlay onto the image buffer.
 * Text is large, bold, centered, with a black stroke for readability on any background.
 * Uses Montserrat-Bold if available, falls back to a generic sans-serif.
 */
async function burnCaption(imageBuffer: Buffer, text: string): Promise<Buffer> {
  const lines = wrapText(text, CAPTION_MAX_CHARS_PER_LINE);
  const totalTextHeight = lines.length * CAPTION_LINE_HEIGHT;
  const centerY = Math.round(VIDEO_HEIGHT * CAPTION_Y_POSITION);
  // Start Y for first line, vertically centered around centerY
  const startY = centerY - Math.round(totalTextHeight / 2) + CAPTION_FONT_SIZE;

  // Use Montserrat if downloaded, otherwise a safe generic fallback
  const fontFamily = existsSync(FONT_PATH)
    ? `url('${FONT_PATH}')`
    : 'sans-serif';

  const fontFaceDecl = existsSync(FONT_PATH)
    ? `@font-face { font-family: 'Montserrat'; src: ${fontFamily}; font-weight: bold; }`
    : '';

  const textElements = lines
    .map((line, i) => {
      const y = startY + i * CAPTION_LINE_HEIGHT;
      const escaped = escapeXml(line);
      return `
        <text
          x="${VIDEO_WIDTH / 2}"
          y="${y}"
          text-anchor="middle"
          font-size="${CAPTION_FONT_SIZE}"
          font-family="${existsSync(FONT_PATH) ? 'Montserrat' : 'sans-serif'}"
          font-weight="bold"
          fill="white"
          stroke="black"
          stroke-width="4"
          stroke-linejoin="round"
          paint-order="stroke fill"
        >${escaped}</text>`;
    })
    .join('\n');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${VIDEO_WIDTH}" height="${VIDEO_HEIGHT}">
      <style>${fontFaceDecl}</style>
      ${textElements}
    </svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png({ quality: 100, compressionLevel: 1 })
    .toBuffer();
}

// ─── Image generation ─────────────────────────────────────────────────────────

async function generateSingleImage(prompt: string): Promise<Buffer> {
  const client = getClient();

  const response = await client.models.generateImages({
    model: IMAGEN_MODEL,
    prompt,
    config: {
      aspectRatio: IMAGEN_ASPECT_RATIO,
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

export async function generateSlideImages(
  slides: Slide[],
  jobId: string,
  creds: AccountCredentials
): Promise<string[]> {
  console.log(`[ImageGen] Generating ${slides.length} images for job ${jobId}`);

  const urls = await withConcurrencyLimit(slides, IMAGE_CONCURRENCY, async (slide, index) => {
    console.log(`[ImageGen] Slide ${index + 1}/${slides.length}: "${slide.image_prompt.substring(0, 60)}..."`);

    // 1. Generate raw image
    const rawBuffer = await generateSingleImage(slide.image_prompt);

    // 2. Burn caption onto the image
    const captionedBuffer = await burnCaption(rawBuffer, slide.text);

    // 3. Upload to Cloudinary
    const url = await uploadSlideImage(captionedBuffer, jobId, index, creds);
    console.log(`[ImageGen] Slide ${index + 1} uploaded: ${url}`);
    return url;
  });

  console.log(`[ImageGen] All ${slides.length} images generated and uploaded`);
  return urls;
}
