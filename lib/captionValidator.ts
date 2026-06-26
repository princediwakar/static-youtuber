/**
 * captionValidator.ts
 *
 * Validates slide text before it reaches image/TTS generation.
 * Catches two categories of caption rendering failure:
 *
 * 1. Words longer than CAPTION_MAX_CHARS_PER_LINE (geography/history terms
 *    like "Vijayanagara", "Balaklava", "Czechoslovakia" would overflow)
 *
 * 2. Slides where the entire text front-loads long words, causing ugly
 *    forced line breaks that make the caption hard to read in 1 second.
 *
 * Called after script generation but before any API spending on images/TTS.
 */

import { CAPTION_MAX_CHARS_PER_LINE, CAPTION_MAX_CHARS } from './constants';

export type CaptionValidationResult = {
  valid: boolean;
  warnings: string[];   // non-fatal: suggest but don't block
  errors: string[];     // fatal: block and flag for regeneration
};

type Slide = {
  text: string;
  index: number; // 1-based
};

/**
 * Simulates the word-wrap algorithm used by the caption renderer.
 * Returns the wrapped lines so we can check rendering safety.
 */
function simulateWordWrap(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = word; // long word starts a new line regardless
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function validateSlideCaption(slide: Slide): CaptionValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const words = slide.text.split(/\s+/);

  // ── Check for words that exceed the line width ────────────────────────────
  const overflowWords = words.filter(w => w.length > CAPTION_MAX_CHARS_PER_LINE);
  if (overflowWords.length > 0) {
    errors.push(
      `Slide ${slide.index}: words exceed caption width (${CAPTION_MAX_CHARS_PER_LINE} chars): ` +
      overflowWords.map(w => `"${w}" (${w.length})`).join(', ')
    );
  }

  // ── Check total character count ────────────────────────────────────────────
  if (slide.text.length > CAPTION_MAX_CHARS) {
    errors.push(`Slide ${slide.index}: ${slide.text.length} chars — exceeds ${CAPTION_MAX_CHARS} char limit.`);
  }

  // ── Check sentence-ending punctuation (catches LLM fragments) ──────────────
  if (!/[.!?]$/.test(slide.text.trimEnd())) {
    errors.push(`Slide ${slide.index}: does not end with sentence-ending punctuation (. ! ?) — likely a truncated fragment.`);
  }

  // ── Check total word count (must fit 3 lines at ~15 chars/line) ────────────
  if (words.length > 14) {
    errors.push(`Slide ${slide.index}: ${words.length} words — too long. Max is 10.`);
  } else if (words.length > 12) {
    warnings.push(`Slide ${slide.index}: ${words.length} words — target ≤10.`);
  }

  // ── Check rendered line count ─────────────────────────────────────────────
  const lines = simulateWordWrap(slide.text, CAPTION_MAX_CHARS_PER_LINE);
  if (lines.length > 3) {
    errors.push(`Slide ${slide.index}: wraps to ${lines.length} caption lines — max is 3.`);
  } else if (lines.length === 3) {
    warnings.push(`Slide ${slide.index}: wraps to 3 caption lines — consider shortening.`);
  }

  // ── Check for problematic punctuation that might confuse TTS ─────────────
  if (/[<>{}[\]|\\]/.test(slide.text)) {
    warnings.push(`Slide ${slide.index}: contains special characters that may affect TTS rendering.`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function validateAllCaptions(slides: Array<{ text: string }>): CaptionValidationResult {
  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  slides.forEach((slide, i) => {
    const result = validateSlideCaption({ text: slide.text, index: i + 1 });
    allWarnings.push(...result.warnings);
    allErrors.push(...result.errors);
  });

  if (allWarnings.length > 0) {
    console.warn('[CaptionValidator] Warnings:\n' + allWarnings.map(w => `  ⚠ ${w}`).join('\n'));
  }

  if (allErrors.length > 0) {
    console.error('[CaptionValidator] Errors (will block generation):\n' + allErrors.map(e => `  ✗ ${e}`).join('\n'));
  }

  return {
    valid: allErrors.length === 0,
    warnings: allWarnings,
    errors: allErrors,
  };
}