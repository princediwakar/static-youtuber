// lib/captionValidator.ts
import { CAPTION_MAX_CHARS_PER_LINE, CAPTION_MAX_CHARS } from './constants';

export type CaptionValidationResult = {
  valid: boolean;
  warnings: string[];
  errors: string[];
};

// Only the fields the validator actually needs — a full CaptionStyle
// (from getCaptionStyle() / getLongFormCaptionStyle()) satisfies this too,
// so callers can pass it straight through without picking fields out.
export type CaptionWidthLimits = {
  maxCharsPerLine: number;
  maxChars: number;
  /** Maximum word count per shot. Defaults to 18 (shorts). Long-form uses 20. */
  maxWords?: number;
};

// Falls back to the original Montserrat-tuned globals if a caller doesn't
// pass per-aesthetic limits — keeps this backward compatible with any other
// call site that predates the per-niche font change.
const DEFAULT_WIDTH_LIMITS: CaptionWidthLimits = {
  maxCharsPerLine: CAPTION_MAX_CHARS_PER_LINE,
  maxChars: CAPTION_MAX_CHARS,
};

type Shot = {
  caption_text: string;
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

function stripDirectorTags(text: string): string {
  return text.replace(/\[.*?\]\s*/g, '').trim();
}

export function validateShotCaption(
  shot: Shot,
  widthLimits: CaptionWidthLimits = DEFAULT_WIDTH_LIMITS,
): CaptionValidationResult {
  const { maxCharsPerLine, maxChars } = widthLimits;
  const warnings: string[] = [];
  const errors: string[] = [];

  // Defensive: never render director tags in captions
  const cleaned = stripDirectorTags(shot.caption_text);
  if (cleaned !== shot.caption_text) {
    warnings.push(`Shot ${shot.index}: contained director tags — stripped before caption render.`);
  }
  
  const words = cleaned.split(/\s+/);

  const overflowWords = words.filter(w => w.length > maxCharsPerLine);
  if (overflowWords.length > 0) {
    errors.push(
      `Shot ${shot.index}: words exceed caption width (${maxCharsPerLine} chars): ` +
      overflowWords.map(w => `"${w}" (${w.length})`).join(', ')
    );
  }

  if (cleaned.length > maxChars) {
    errors.push(`Shot ${shot.index}: ${cleaned.length} chars — exceeds ${maxChars} char limit.`);
  }


  const maxWords = widthLimits.maxWords ?? 18;
  const warnWords = maxWords > 18 ? maxWords - 3 : 12;  // warn at 17 for long-form, 12 for shorts
  if (words.length > maxWords) {
    errors.push(`Shot ${shot.index}: ${words.length} words — too long. Max is ${maxWords}.`);
  } else if (words.length > warnWords) {
    warnings.push(`Shot ${shot.index}: ${words.length} words — target ≤${warnWords}.`);
  }

  const lines = simulateWordWrap(cleaned, maxCharsPerLine);
  if (lines.length > 3) {
    errors.push(`Shot ${shot.index}: wraps to ${lines.length} caption lines — max is 3.`);
  } else if (lines.length === 3) {
    warnings.push(`Shot ${shot.index}: wraps to 3 caption lines — consider shortening.`);
  }

  if (/[<>{}[\]|\\]/.test(shot.caption_text)) {
    warnings.push(`Shot ${shot.index}: contains special characters that may affect TTS rendering.`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

export function validateAllCaptions(
  shots: Array<{ caption_text: string }>,
  widthLimits: CaptionWidthLimits = DEFAULT_WIDTH_LIMITS,
): CaptionValidationResult {
  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  shots.forEach((shot, i) => {
    const result = validateShotCaption({ caption_text: shot.caption_text, index: i + 1 }, widthLimits);
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