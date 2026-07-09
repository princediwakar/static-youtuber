import { z } from 'zod';

export const ShotSchema = z.object({
  id: z.number(),
  visual_prompt: z.string()
    .min(15, 'Scene description too short — expand with visual details (lighting, mood, camera angle)')
    .max(600, 'Image prompt must be ≤600 chars'),
  caption_text: z.string()
    .refine(t => t.trim().split(/\s+/).length >= 1, 'Min 1 word')
    .refine(t => t.trim().split(/\s+/).length <= 25, 'Max 25 words')
    .refine(t => !/\[.*?\]/.test(t), 'No director tags in text'),
  spoken_text: z.string()
    .min(1, 'Must contain spoken phonetic text for TTS'),
  is_conclusion: z.boolean().default(false),
});

export const SlideshowScriptSchema = z.object({
  fact_check_and_sources: z.array(z.object({
    claim: z.string().min(10),
    source: z.string().min(2),
  })).min(3),
  visual_world: z.enum(['tech-minimalist', 'finance-editorial', 'stoic-zen', 'survival-technical']),
  format_template: z.enum(['RAPID_FIRE', 'SLOW_BURN', 'THE_LIST']),
  title: z.string().min(5).max(100),
  description: z.string().min(30).max(500),
  tags: z.array(z.string()).min(5).max(12),
  voiceName: z.string().min(1),
  shots: z.array(ShotSchema).min(12).max(25),
  thumbnailPrompt: z.string().min(30).max(500),
}).refine(data => data.shots.filter(s => s.is_conclusion).length === 1, {
  message: 'Exactly one shot must be marked as the conclusion',
}).refine(data => data.shots[data.shots.length - 1].is_conclusion, {
  message: 'The conclusion shot must be the last shot',
}).refine(data => /[.!?]$/.test(data.shots[data.shots.length - 1].spoken_text.trim()), {
  message: 'The final shot must end with terminal punctuation (. ! ?)',
});

export const QualityScoreSchema = z.object({
  specificity: z.number().min(0).max(10),
  hook_strength: z.number().min(0).max(10),
  information_density: z.number().min(0).max(10),
  tone_calibration: z.number().min(0).max(10),
  pacing: z.number().min(0).max(10),
  visual_entropy: z.number().min(0).max(10),
  visual_coherence: z.number().min(0).max(10),
  caption_flow: z.number().min(0).max(10),
  hook_payoff_match: z.number().min(0).max(10),
  overall: z.number().min(0).max(10),
  issues: z.array(z.string()),
  approved: z.boolean(),
});
export type QualityScore = z.infer<typeof QualityScoreSchema>;

export const QUALITY_SCORE_DIMENSIONS = [
  'specificity', 'hook_strength', 'information_density', 'tone_calibration',
  'pacing', 'visual_entropy', 'visual_coherence', 'caption_flow', 'hook_payoff_match',
] as const;

export const LongShotSchema = z.object({
  id: z.number(),
  visual_prompt: z.string()
    .min(15, 'Scene description too short — expand with visual details (lighting, mood, camera angle)')
    .max(800, 'Image prompt must be ≤800 chars'),
  caption_text: z.string()
    .refine(t => t.trim().split(/\s+/).length >= 1, 'Min 1 word')
    .refine(t => t.trim().split(/\s+/).length <= 30, 'Max 30 words')
    .refine(t => !/\[.*?\]/.test(t), 'No director tags in text'),
  spoken_text: z.string().min(1),
  is_conclusion: z.boolean().default(false),
});

export const LongFormScriptSchema = z.object({
  fact_check_and_sources: z.array(z.object({
    claim: z.string().min(10),
    source: z.string().min(2),
  })).min(5),
  visual_world: z.enum(['tech-minimalist', 'finance-editorial', 'stoic-zen', 'survival-technical']),
  format_template: z.literal('DEEP_DIVE'),
  title: z.string().min(5).max(100),
  description: z.string().min(50).max(1000),
  tags: z.array(z.string()).min(5).max(15),
  voiceName: z.string().min(1),
  shots: z.array(LongShotSchema).min(30).max(60),
  thumbnailPrompt: z.string().min(30).max(500),
}).refine(data => data.shots.filter(s => s.is_conclusion).length === 1, {
  message: 'Exactly one shot must be marked as the conclusion',
}).refine(data => data.shots[data.shots.length - 1].is_conclusion, {
  message: 'The conclusion shot must be the last shot',
}).refine(data => /[.!?]$/.test(data.shots[data.shots.length - 1].spoken_text.trim()), {
  message: 'The final shot must end with terminal punctuation',
});

export const LongQualityScoreSchema = z.object({
  narrative_coherence:  z.number().min(0).max(10),
  factual_depth:        z.number().min(0).max(10),
  arc_satisfaction:     z.number().min(0).max(10),
  visual_variety:       z.number().min(0).max(10),
  information_density:  z.number().min(0).max(10),
  tone_calibration:     z.number().min(0).max(10),
  overall:  z.number().min(0).max(10),
  issues:   z.array(z.string()),
  approved: z.boolean(),
});
export type LongQualityScore = z.infer<typeof LongQualityScoreSchema>;

export const LONG_QUALITY_DIMENSIONS = [
  'narrative_coherence', 'factual_depth', 'arc_satisfaction',
  'visual_variety', 'information_density', 'tone_calibration',
] as const;

export function ensureTerminalPunctuation(script: any): any {
  const shots = script?.shots;
  const last = Array.isArray(shots) ? shots[shots.length - 1] : null;
  if (last && typeof last.spoken_text === 'string') {
    const trimmed = last.spoken_text.trim();
    if (trimmed && !/[.!?]$/.test(trimmed)) {
      last.spoken_text = `${trimmed}.`;
    }
  }
  return script;
}
