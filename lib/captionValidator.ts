// lib/captionValidator.ts
import { CAPTION_MAX_CHARS_PER_LINE, CAPTION_MAX_CHARS } from './constants';

export type CaptionValidationResult = {
  valid: boolean;
  warnings: string[];
  errors: string[];
};

type Slide = {
  text: string;
  index: number; 
};

function simulateWordWrap(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = word; 
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

  const overflowWords = words.filter(w => w.length > CAPTION_MAX_CHARS_PER_LINE);
  if (overflowWords.length > 0) {
    errors.push(
      `Slide ${slide.index}: words exceed caption width (${CAPTION_MAX_CHARS_PER_LINE} chars): ` +
      overflowWords.map(w => `"${w}" (${w.length})`).join(', ')
    );
  }

  if (slide.text.length > CAPTION_MAX_CHARS) {
    errors.push(`Slide ${slide.index}: ${slide.text.length} chars — exceeds ${CAPTION_MAX_CHARS} char limit.`);
  }

  if (!/[.!?]$/.test(slide.text.trimEnd())) {
    errors.push(`Slide ${slide.index}: does not end with sentence-ending punctuation (. ! ?) — likely a truncated fragment.`);
  }

  if (words.length > 14) {
    errors.push(`Slide ${slide.index}: ${words.length} words — too long. Max is 10.`);
  } else if (words.length > 12) {
    warnings.push(`Slide ${slide.index}: ${words.length} words — target ≤10.`);
  }

  const lines = simulateWordWrap(slide.text, CAPTION_MAX_CHARS_PER_LINE);
  if (lines.length > 3) {
    errors.push(`Slide ${slide.index}: wraps to ${lines.length} caption lines — max is 3.`);
  } else if (lines.length === 3) {
    warnings.push(`Slide ${slide.index}: wraps to 3 caption lines — consider shortening.`);
  }

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