// Path: lib/thumbnailGenerator.ts
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { IMAGE_MODEL, THUMBNAIL_STYLE_PREFIX, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT } from './constants';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

/**
 * Renders the video title as a bold text overlay on a thumbnail image.
 * Uses sharp's SVG compositing — no external font files required.
 */
async function addTextOverlay(imageBuffer: Buffer, title: string): Promise<Buffer> {
  // Truncate for readability
  const displayTitle = title.length > 60 ? title.substring(0, 57) + '…' : title;

  // Word-wrap at ~28 chars per line
  const words = displayTitle.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > 28) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + ' ' + word).trim();
    }
  }
  if (current) lines.push(current.trim());

  const lineHeight = 72;
  const fontSize = 58;
  const totalTextHeight = lines.length * lineHeight;
  const yStart = THUMBNAIL_HEIGHT / 2 + 80; // lower-half position

  const svgLines = lines.map((line, i) => {
    const y = yStart + i * lineHeight;
    return `
      <text
        x="50%"
        y="${y}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="bold"
        fill="white"
        stroke="black"
        stroke-width="4"
        paint-order="stroke"
        letter-spacing="-1"
      >${line}</text>`;
  });

  // Dark gradient at the bottom to make text legible
  const gradientY = yStart - lineHeight;
  const gradientHeight = totalTextHeight + lineHeight * 2;

  const svg = `
    <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="black" stop-opacity="0"/>
          <stop offset="100%" stop-color="black" stop-opacity="0.82"/>
        </linearGradient>
      </defs>
      <rect x="0" y="${gradientY}" width="${THUMBNAIL_WIDTH}" height="${gradientHeight}" fill="url(#grad)"/>
      ${svgLines.join('')}
    </svg>`;

  return sharp(imageBuffer)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png({ quality: 95 })
    .toBuffer();
}

/**
 * Generates a thumbnail:
 * 1. Calls Imagen 3 with the thumbnailPrompt
 * 2. Resizes to 1280×720 (YouTube thumbnail spec)
 * 3. Overlays the video title as bold text
 */
export async function generateThumbnail(title: string, thumbnailPrompt: string): Promise<Buffer> {
  console.log(`[Thumbnail] Generating for: "${title}"`);
  const client = getClient();

  const fullPrompt = `${THUMBNAIL_STYLE_PREFIX} ${thumbnailPrompt}`;

  const response = await client.models.generateImages({
    model: 'imagen-4.0-fast-generate-001',
    prompt: fullPrompt,
    config: {
      aspectRatio: '16:9',
      numberOfImages: 1,
    },
  });

  const imageData = response.generatedImages?.[0]?.image?.imageBytes;
  if (!imageData) throw new Error('Imagen 3 returned no thumbnail data');

  const rawBuffer = Buffer.from(imageData, 'base64');
  const withText = await addTextOverlay(rawBuffer, title);

  console.log(`[Thumbnail] Generated: ${(withText.length / 1024).toFixed(0)} KB`);
  return withText;
}
