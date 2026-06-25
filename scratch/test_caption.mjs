import sharp from 'sharp';
import fs from 'fs';

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const CAPTION_FONT_SIZE = 86;
export const CAPTION_MAX_CHARS_PER_LINE = 18;
export const CAPTION_Y_POSITION = 0.80; // 80% down the frame (bottom, but safe from clipping)
export const CAPTION_LINE_HEIGHT = 110;

function wrapText(text, maxCharsPerLine) {
  const words = text.split(' ');
  const lines = [];
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

function escapeXml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function burnCaption(imageBuffer, text) {
  const lines = wrapText(text, CAPTION_MAX_CHARS_PER_LINE);
  const totalTextHeight = lines.length * CAPTION_LINE_HEIGHT;
  const centerY = Math.round(VIDEO_HEIGHT * CAPTION_Y_POSITION);
  const startY = centerY - Math.round(totalTextHeight / 2) + CAPTION_FONT_SIZE;

  const fontName = 'Montserrat';
  const textElements = lines
    .map((line, i) => {
      const y = startY + i * CAPTION_LINE_HEIGHT;
      const words = line.split(' ');

      const tspans = words
        .map((word, wi) => {
          const escaped = escapeXml(word);
          const space = wi === 0 ? '' : '&#160;';
          return `<tspan>${space}${escaped}</tspan>`;
        })
        .join('');

      return `
        <text
          x="${VIDEO_WIDTH / 2}"
          y="${y}"
          text-anchor="middle"
          font-size="${CAPTION_FONT_SIZE}"
          font-family="${fontName}, 'Arial Unicode MS', 'Noto Sans Devanagari', 'Mangal', sans-serif"
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
      ${textElements}
    </svg>`;
  
  console.log("SVG Payload:\n", svg);

  return sharp(imageBuffer)
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, { fit: 'cover', position: 'centre' })
    .composite([{ input: Buffer.from(svg), blend: 'over' }])
    .png({ quality: 100, compressionLevel: 1 })
    .toBuffer();
}

async function main() {
  const blankImage = await sharp({
    create: { width: 1080, height: 1920, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } }
  }).png().toBuffer();

  const hindiText = "क्या आप जानते हैं कि एक वाइकिंग ने ऐसा कुछ किया?";

  try {
    const captioned = await burnCaption(blankImage, hindiText);
    fs.writeFileSync('scratch/test_output.png', captioned);
    console.log("Success! File scratch/test_output.png written.");
  } catch (err) {
    console.error("Error generating caption:", err);
  }
}

main();
