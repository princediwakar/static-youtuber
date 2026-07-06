// Path: lib/cloudflareAi.ts
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import {
  CF_AI_IMAGE_MODEL,
  CF_AI_IMAGE_STEPS,
  CF_AI_IMAGE_STEPS_FLUX2,
  CF_AI_IMAGE_GUIDANCE_FLUX2,
} from './constants';

const CACHE_DIR = path.join('/tmp', 'cache', 'flux');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cachePath(hash: string): string {
  return path.join(CACHE_DIR, `${hash}.jpg`);
}

// The model is now part of the hash. Flipping CF_AI_IMAGE_MODEL (e.g. schnell
// -> flux-2-dev) used to be able to silently serve back a cached image that
// was actually rendered by the *other* model, since the old hash only covered
// prompt/width/height/steps.
function contentHash(model: string, prompt: string, width: number, height: number, steps: number): string {
  return createHash('sha256').update(`${model}|${prompt}|${width}|${height}|${steps}`).digest('hex').slice(0, 16);
}

function resolveAccounts(): { token: string; accountId: string }[] {
  const pairs: { token: string; accountId: string }[] = [];

  for (const suffix of ['', '_1', '_2', '_3', '_4', '_5']) {
    const token = process.env[`CLOUDFLARE_AI_API_TOKEN${suffix}`];
    const accountId = process.env[`CLOUDFLARE_ACCOUNT_ID${suffix}`];
    if (token && accountId) pairs.push({ token, accountId });
  }

  if (pairs.length === 0) throw new Error('No CLOUDFLARE_AI_API_TOKEN / CLOUDFLARE_ACCOUNT_ID pair is set');
  return pairs;
}

function isFlux2(model: string): boolean {
  return model.includes('flux-2');
}

function defaultStepsFor(model: string): number {
  return isFlux2(model) ? CF_AI_IMAGE_STEPS_FLUX2 : CF_AI_IMAGE_STEPS;
}

export async function generateImage(
  prompt: string,
  width: number,
  height: number,
  steps?: number,
  retries: number = 6,
): Promise<Buffer> {
  const accounts = resolveAccounts();
  const model = CF_AI_IMAGE_MODEL;
  const resolvedSteps = steps ?? defaultStepsFor(model);
  const flux2 = isFlux2(model);

  ensureCacheDir();

  const hash = contentHash(model, prompt, width, height, resolvedSteps);
  const cachedPath = cachePath(hash);
  if (existsSync(cachedPath)) {
    return readFileSync(cachedPath);
  }

  // Shuffle so we don't always hammer the first account
  const shuffled = [...accounts].sort(() => Math.random() - 0.5);

  for (let attempt = 1; attempt <= retries; attempt++) {
    // Cycle through accounts on retryable failures — if one account is
    // rate-limited, the next attempt tries the other account.
    const { token, accountId } = shuffled[(attempt - 1) % shuffled.length];
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

    // flux-2-dev takes multipart/form-data, not a JSON body — different
    // request shape entirely from flux-1-schnell. Never set Content-Type
    // manually on the multipart branch; fetch derives the boundary itself.
    const fetchInit: RequestInit = flux2
      ? {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: (() => {
            const form = new FormData();
            form.append('prompt', prompt);
            form.append('width', String(width));
            form.append('height', String(height));
            form.append('steps', String(resolvedSteps));
            form.append('guidance', String(CF_AI_IMAGE_GUIDANCE_FLUX2));
            return form;
          })(),
        }
      : {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          // Cloudflare's documented field name for flux-1-schnell is `steps`
          // (max 8) — the previous version of this file sent `num_steps`,
          // which isn't a documented parameter for this model. `num_steps`
          // is still included here as a harmless hedge in case some deployed
          // model revision expects it, but `steps` is the one that's real.
          body: JSON.stringify({ prompt, width, height, steps: resolvedSteps, num_steps: resolvedSteps }),
        };

    try {
      const res = await fetch(url, fetchInit);

      if (!res.ok) {
        const errorText = await res.text().catch(() => 'unknown');
        const msg = `Cloudflare AI error ${res.status}: ${errorText.slice(0, 500)}`;

        const isRetryable =
          res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;

        if (attempt < retries && isRetryable) {
          const delay = 2000 * attempt;
          console.warn(`[CloudflareAI] Account ${accountId.slice(0, 8)}... attempt ${attempt} failed with ${res.status}, retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(msg);
      }

      const json = await res.json();
      if (!json.result?.image) {
        throw new Error(`Cloudflare AI returned no image: ${JSON.stringify(json).slice(0, 500)}`);
      }

      const buffer = Buffer.from(json.result.image, 'base64');
      writeFileSync(cachedPath, buffer);
      return buffer;
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const isRetryable =
        msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET') ||
        msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND') ||
        msg.includes('fetch failed') || msg.includes('socket hang up') ||
        msg.includes('network') || msg.includes('timeout') || msg.includes('abort');

      if (attempt < retries && isRetryable) {
        const delay = 2000 * attempt;
        console.warn(`[CloudflareAI] Attempt ${attempt} failed with network error, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Cloudflare AI image generation failed after all retries');
}