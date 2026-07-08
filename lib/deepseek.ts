// Path: lib/deepseek.ts
import { DEEPSEEK_TEXT_MODEL } from './constants';
const DEEPSEEK_BASE = 'https://api.deepseek.com/beta/chat/completions';

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
    // deepseek-v4-pro defaults to thinking ENABLED, which burns max_tokens
    // budget on internal reasoning — leaving zero tokens for the response.
    // Must explicitly disable for non-reasoning workloads (JSON mode, prose).
    thinking: { type: 'disabled' },
  };

  if (responseJson) {
    body.response_format = { type: 'json_object' };
  }

  // DeepSeek JSON mode occasionally returns empty content (documented caveat).
  // Retry once with a slightly different temperature to shake the latent space.
  for (let attempt = 0; attempt < 2; attempt++) {
    let currentMessages = [...messages];
    let fullContent = '';
    let isComplete = false;

    for (let continuation = 0; continuation < 4; continuation++) { // Allow up to 4x8K = 32K tokens
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const res = await fetch(DEEPSEEK_BASE, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...body,
            messages: currentMessages,
            temperature: attempt === 0 ? temperature : (temperature + 0.15) % 1,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => 'unknown');
          throw new Error(`DeepSeek API error ${res.status}: ${errorBody.slice(0, 500)}`);
        }

        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || '';
        const finishReason = json.choices?.[0]?.finish_reason;

        fullContent += content;

        if (finishReason === 'length' || finishReason === 'max_tokens') {
          console.log(`[DeepSeek] Hit max_tokens, continuing generation (chunk ${continuation + 1})...`);
          
          // The API expects a single trailing assistant message for prefix continuation.
          // If we already added one in a previous loop, replace it.
          if (currentMessages[currentMessages.length - 1].role === 'assistant') {
            currentMessages.pop();
          }
          currentMessages.push({ role: 'assistant', content: fullContent, prefix: true } as any);
        } else {
          isComplete = true;
          break;
        }
      } finally {
        clearTimeout(timer);
      }
    }

    if (isComplete && fullContent) {
      return fullContent;
    }

    if (attempt === 0) {
      console.warn('[DeepSeek] Empty content or failed continuation on attempt 1, retrying with jittered temperature...');
    }
  }

  throw new Error('DeepSeek returned empty content or failed to complete after all attempts');
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
