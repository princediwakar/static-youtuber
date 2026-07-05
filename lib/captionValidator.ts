// lib/captionValidator.ts
import { CAPTION_MAX_CHARS_PER_LINE, CAPTION_MAX_CHARS } from './constants';

export type CaptionValidationResult = {
  valid: boolean;
  warnings: string[];
  errors: string[];
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

export function validateShotCaption(shot: Shot): CaptionValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Defensive: never render director tags in captions
  const cleaned = stripDirectorTags(shot.caption_text);
  if (cleaned !== shot.caption_text) {
    warnings.push(`Shot ${shot.index}: contained director tags — stripped before caption render.`);
  }
  
  const words = cleaned.split(/\s+/);

  const overflowWords = words.filter(w => w.length > CAPTION_MAX_CHARS_PER_LINE);
  if (overflowWords.length > 0) {
    errors.push(
      `Shot ${shot.index}: words exceed caption width (${CAPTION_MAX_CHARS_PER_LINE} chars): ` +
      overflowWords.map(w => `"${w}" (${w.length})`).join(', ')
    );
  }

  if (cleaned.length > CAPTION_MAX_CHARS) {
    errors.push(`Shot ${shot.index}: ${cleaned.length} chars — exceeds ${CAPTION_MAX_CHARS} char limit.`);
  }


  if (words.length > 18) {
    errors.push(`Shot ${shot.index}: ${words.length} words — too long. Max is 18.`);
  } else if (words.length > 12) {
    warnings.push(`Shot ${shot.index}: ${words.length} words — target ≤12.`);
  }

  const lines = simulateWordWrap(cleaned, CAPTION_MAX_CHARS_PER_LINE);
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

export function validateAllCaptions(shots: Array<{ caption_text: string }>): CaptionValidationResult {
  const allWarnings: string[] = [];
  const allErrors: string[] = [];

  shots.forEach((shot, i) => {
    const result = validateShotCaption({ caption_text: shot.caption_text, index: i + 1 });
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