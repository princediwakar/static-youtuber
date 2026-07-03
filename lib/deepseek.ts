// Path: lib/deepseek.ts
import { DEEPSEEK_TEXT_MODEL } from './constants';

const DEEPSEEK_BASE = 'https://api.deepseek.com/chat/completions';

export async function chatCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature?: number; maxTokens?: number; responseJson?: boolean; timeout?: number } = {},
): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY is not set');

  const { temperature = 0.7, maxTokens = 4096, responseJson = false, timeout = 120_000 } = options;

  const body: Record<string, unknown> = {
    model: DEEPSEEK_TEXT_MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (responseJson) {
    body.response_format = { type: 'json_object' };
  }

  // DeepSeek JSON mode occasionally returns empty content (documented caveat).
  // Retry once with a slightly different temperature to shake the latent space.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(DEEPSEEK_BASE, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(attempt === 0 ? body : { ...body, temperature: (temperature + 0.15) % 1 }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorBody = await res.text().catch(() => 'unknown');
        throw new Error(`DeepSeek API error ${res.status}: ${errorBody.slice(0, 500)}`);
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content;
      if (content) return content;

      if (attempt === 0) {
        console.warn('[DeepSeek] Empty content on attempt 1, retrying with jittered temperature...');
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('DeepSeek returned empty content on both attempts');
}

export function extractJson(raw: string): unknown {
  let clean = raw.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
  }
  const bracketMatch = clean.match(/\{[\s\S]*\}/);
  if (bracketMatch) clean = bracketMatch[0];
  return JSON.parse(clean);
}
