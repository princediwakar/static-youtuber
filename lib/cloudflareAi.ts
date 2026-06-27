// Path: lib/cloudflareAi.ts
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { CF_AI_IMAGE_MODEL } from './constants';

const CACHE_DIR = path.join(process.cwd(), 'cache', 'flux');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cachePath(hash: string): string {
  return path.join(CACHE_DIR, `${hash}.jpg`);
}

function contentHash(prompt: string, width: number, height: number, steps: number): string {
  return createHash('sha256').update(`${prompt}|${width}|${height}|${steps}`).digest('hex').slice(0, 16);
}

export async function generateImage(
  prompt: string,
  width: number,
  height: number,
  steps: number = 4,
  retries: number = 3,
): Promise<Buffer> {
  const token = process.env.CLOUDFLARE_AI_API_TOKEN;
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !accountId) throw new Error('CLOUDFLARE_AI_API_TOKEN or CLOUDFLARE_ACCOUNT_ID is not set');

  ensureCacheDir();

  const hash = contentHash(prompt, width, height, steps);
  const cachedPath = cachePath(hash);
  if (existsSync(cachedPath)) {
    return readFileSync(cachedPath);
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_AI_IMAGE_MODEL}`;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt, width, height, num_steps: steps }),
      });

      if (res.status === 429 && attempt < retries) {
        const delay = 2000 * attempt;
        console.warn(`[CloudflareAI] Rate limited, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'unknown');
        throw new Error(`Cloudflare AI error ${res.status}: ${errorText.slice(0, 500)}`);
      }

      const json = await res.json();
      if (!json.result?.image) {
        throw new Error(`Cloudflare AI returned no image: ${JSON.stringify(json).slice(0, 500)}`);
      }

      const buffer = Buffer.from(json.result.image, 'base64');
      writeFileSync(cachedPath, buffer);
      return buffer;
    } catch (err: any) {
      if (attempt === retries) throw err;
      const msg = err?.message ?? String(err);
      if (msg.includes('429')) {
        const delay = 2000 * attempt;
        console.warn(`[CloudflareAI] Rate limited, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }

  throw new Error('Cloudflare AI image generation failed after all retries');
}
