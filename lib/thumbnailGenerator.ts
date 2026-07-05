// Path: lib/thumbnailGenerator.ts
import sharp from 'sharp';
import { generateImage } from './cloudflareAi';
import { THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, AESTHETICS, NICHE_PROFILES, DEFAULT_NICHE_PROFILE } from './constants';

// ─── Thumbnail prompt builder ─────────────────────────────────────────────────

export function buildThumbnailPrompt(
  rawThumbnailPrompt: string,
  niche: string,
): string {
  const profile = NICHE_PROFILES[niche] ?? DEFAULT_NICHE_PROFILE;
  const aesthetic = AESTHETICS[profile.aestheticId] ?? Object.values(AESTHETICS)[0];

  return `${aesthetic.thumbnailPrefix}${rawThumbnailPrompt}

THUMBNAIL COMPOSITION RULES (critical — follow exactly):
- Single, dominant focal point. Absolutely no cluttered scenes.
- Maintain massive, clean negative space to allow for text overlay without visual conflict.
- The color palette and lighting must strictly adhere to the aesthetic prefix provided above.
- Strong visual hierarchy: lead the eye to the central concept.
- CRITICAL: NO text, watermarks, logos, numbers, or lettering anywhere in the image.`;
}

// ─── Caption renderer ─────────────────────────────────────────────────────────

function wordWrap(text: string, maxChars = 24, maxLines = 3): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (lines.length >= maxLines) break;

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
  const fontSize = 58;
  const totalTextHeight = lines.length * lineHeight;

  const yStart = THUMBNAIL_HEIGHT * 0.75;

  const svgLines = lines.map((line, i) => {
    const y = yStart + i * lineHeight;
    return `
      <text
        x="50%"
        y="${y}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Montserrat, Inter, system-ui, -apple-system, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="white"
        stroke="black"
        stroke-width="3"
        stroke-linejoin="round"
        paint-order="stroke"
        letter-spacing="-0.5"
      >${escapeXml(line)}</text>
      <text
        x="50%"
        y="${y}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Montserrat, Inter, system-ui, -apple-system, sans-serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="white"
        stroke-width="0"
        letter-spacing="-0.5"
      >${escapeXml(line)}</text>`;
  });

  const svg = `
    <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      ${svgLines.join('')}
    </svg>`;

  return sharp(imageBuffer)
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .jpeg({ quality: 92 })
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

export async function generateThumbnail(
  title: string,
  rawThumbnailPrompt: string,
  niche: string,
): Promise<Buffer> {
  console.log(`[Thumbnail] Generating for: "${title}"`);

  const fullPrompt = buildThumbnailPrompt(rawThumbnailPrompt, niche);

  const rawBuffer = await generateImage(fullPrompt, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, 8);
  const withText = await addTextOverlay(rawBuffer, title);

  console.log(`[Thumbnail] Generated: ${(withText.length / 1024).toFixed(0)} KB`);
  return withText;
}
