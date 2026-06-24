// Path: lib/imageGenerator.ts
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import { Slide, AccountCredentials } from './types';
import { uploadSlideImage } from './cloudinary';
import {
  IMAGEN_MODEL,
  IMAGEN_ASPECT_RATIO,
  IMAGE_CONCURRENCY,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
} from './constants';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

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
  if (!imageData) throw new Error('Imagen 3 returned no image data');

  // imageBytes is base64 encoded
  const rawBuffer = Buffer.from(imageData, 'base64');

  // Resize to exact 1080×1920 for Shorts
  const resized = await sharp(rawBuffer)
    .resize(VIDEO_WIDTH, VIDEO_HEIGHT, {
      fit: 'cover',
      position: 'centre',
    })
    .png({ quality: 100, compressionLevel: 1 }) // high quality PNG
    .toBuffer();

  return resized;
}

// Concurrency-limited parallel generation
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

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
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
    const imageBuffer = await generateSingleImage(slide.image_prompt);
    const url = await uploadSlideImage(imageBuffer, jobId, index, creds);
    console.log(`[ImageGen] Slide ${index + 1} uploaded: ${url}`);
    return url;
  });

  console.log(`[ImageGen] All ${slides.length} images generated and uploaded`);
  return urls;
}
