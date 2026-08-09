// Path: lib/llm.ts
import { getModalLlmUrl } from './constants';

// Whether to use DeepSeek API directly instead of the Modal-hosted vLLM server.
// Falls back to DeepSeek when MODAL_LLM_URL is not configured.
function getLlmConfig(): { url: string; headers: Record<string, string>; modelOverride?: string } {
  const modalUrl = getModalLlmUrl();
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const deepseekModel = process.env.DEEPSEEK_TEXT_MODEL || 'deepseek-chat';

  if (modalUrl) {
    return {
      url: `${modalUrl}/v1/chat/completions`,
      headers: { 'Content-Type': 'application/json' },
    };
  }

  if (deepseekKey) {
    console.log(`[LLM] No MODAL_LLM_URL — using DeepSeek API directly (model: ${deepseekModel})`);
    return {
      url: 'https://api.deepseek.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${deepseekKey}`,
      },
      modelOverride: deepseekModel,
    };
  }

  // Last resort: hardcoded Modal fallback
  return {
    url: `https://mental-alternate--llm-server-fastapi-app.modal.run/v1/chat/completions`,
    headers: { 'Content-Type': 'application/json' },
  };
}

export async function chatCompletion(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options: { temperature?: number; maxTokens?: number; responseJson?: boolean; timeout?: number } = {},
): Promise<string> {
  const { url: llmUrl, headers: llmHeaders, modelOverride } = getLlmConfig();

  const { temperature = 0.7, maxTokens = 4096, responseJson = false, timeout = 600_000 } = options;

  const body: Record<string, unknown> = {
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  if (modelOverride) {
    body.model = modelOverride;
  }

  if (responseJson) {
    body.response_format = { type: 'json_object' };
  }

  // Sometimes models need a nudge or might fail on a single attempt due to cluster scaling
  for (let attempt = 0; attempt < 2; attempt++) {
    let currentMessages = [...messages];
    let fullContent = '';
    let isComplete = false;

    for (let continuation = 0; continuation < 4; continuation++) { // Allow up to 4x8K = 32K tokens
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      try {
        const res = await fetch(llmUrl, {
          method: 'POST',
          headers: llmHeaders,
          body: JSON.stringify({
            ...body,
            messages: currentMessages,
            temperature: attempt === 0 ? temperature : (temperature + 0.15) % 1,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorBody = await res.text().catch(() => 'unknown');
          throw new Error(`LLM API error ${res.status}: ${errorBody.slice(0, 500)}`);
        }

        const json = await res.json();
        const content = json.choices?.[0]?.message?.content || '';
        const finishReason = json.choices?.[0]?.finish_reason;

        fullContent += content;

        if (finishReason === 'length' || finishReason === 'max_tokens') {
          console.log(`[LLM] Hit max_tokens, continuing generation (chunk ${continuation + 1})...`);
          
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
      console.warn('[LLM] Empty content or failed continuation on attempt 1, retrying with jittered temperature...');
    }
  }

  throw new Error('LLM returned empty content or failed to complete after all attempts');
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
