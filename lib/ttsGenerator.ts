/**
 * ttsGenerator.ts
 *
 * Replaces the old approach of sending raw slide text to TTS.
 * Now sends a full "director's notes + transcript" prompt to the TTS model,
 * which gives far more control over tone, pacing, and delivery style.
 *
 * Key changes:
 * - Voice selected per niche via TTS_VOICE_PROFILES (not hardcoded Charon)
 * - Each slide's audio_tag is embedded in the transcript for inline delivery control
 * - A director's notes preamble sets the overall documentary tone
 * - Retry logic handles the occasional 500 error from the TTS model
 */

import { GoogleGenAI, type GenerateContentConfig } from '@google/genai';
import {
  TTS_MODEL,
  TTS_SAMPLE_RATE,
  TTS_VOICE_PROFILES,
  DEFAULT_TTS_VOICE_PROFILE,
  type TTSVoiceProfile,
} from './constants';

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

/**
 * Builds the full TTS prompt for a single slide.
 *
 * Structure follows the Gemini TTS advanced prompting guide:
 * - Director's notes (from niche voice profile)
 * - TRANSCRIPT section with the audio_tag inline
 *
 * Example output:
 *   # AUDIO PROFILE: Documentary Narrator
 *   ...director notes...
 *
 *   ### TRANSCRIPT
 *   [curious] There is a village in Germany you can only reach by driving
 *   through Belgium.
 */
function buildTTSPrompt(profile: TTSVoiceProfile, slideText: string, audioTag: string): string {
  // Sanitise the audio tag: strip brackets for the TTS model's inline tag format
  const tag = audioTag.trim();

  return `${profile.directorNotes}

### TRANSCRIPT
${tag} ${slideText}`;
}

export type SlideInput = {
  text: string;
  audio_tag: string;
};

export type TTSResult = {
  audioBuffer: Buffer;
  durationEstimateMs: number;
};

const MAX_TTS_RETRIES = 3;

/**
 * Generates TTS audio for a single slide.
 * Returns raw PCM buffer at TTS_SAMPLE_RATE (24kHz, mono, 16-bit).
 */
export async function generateSlideAudio(
  slide: SlideInput,
  niche: string,
): Promise<TTSResult> {
  const client = getClient();
  const voiceProfile = TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE;
  const ttsPrompt = buildTTSPrompt(voiceProfile, slide.text, slide.audio_tag);

  for (let attempt = 1; attempt <= MAX_TTS_RETRIES; attempt++) {
    try {
      const config: GenerateContentConfig = {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceProfile.voice,
            },
          },
        },
      };

      const response = await client.models.generateContent({
        model: TTS_MODEL,
        contents: [{ role: 'user', parts: [{ text: ttsPrompt }] }],
        config,
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(
        (p: any) => p.inlineData?.mimeType?.startsWith('audio/')
      );

      if (!audioPart?.inlineData?.data) {
        if (attempt === MAX_TTS_RETRIES) {
          throw new Error(`TTS returned no audio data after ${MAX_TTS_RETRIES} attempts`);
        }
        console.warn(`[TTS] Attempt ${attempt}: no audio data, retrying...`);
        await new Promise(res => setTimeout(res, 1000 * attempt));
        continue;
      }

      const audioBuffer = Buffer.from(audioPart.inlineData.data as string, 'base64');

      // Estimate duration: PCM s16le at 24kHz mono = 2 bytes/sample
      const durationMs = (audioBuffer.length / 2 / TTS_SAMPLE_RATE) * 1000;

      return { audioBuffer, durationEstimateMs: durationMs };
    } catch (err: any) {
      // The TTS model occasionally returns 500 — retry
      if (attempt < MAX_TTS_RETRIES && (err.message?.includes('500') || err.message?.includes('audio tokens'))) {
        console.warn(`[TTS] Attempt ${attempt} failed with retryable error: ${err.message}`);
        await new Promise(res => setTimeout(res, 1500 * attempt));
        continue;
      }
      throw err;
    }
  }

  throw new Error('TTS generation failed after all retries');
}

/**
 * Generates TTS for all slides sequentially.
 * Returns an array of TTSResult in slide order.
 */
export async function generateAllSlideAudio(
  slides: SlideInput[],
  niche: string,
): Promise<TTSResult[]> {
  const results: TTSResult[] = [];

  for (let i = 0; i < slides.length; i++) {
    console.log(`[TTS] Generating slide ${i + 1}/${slides.length} — voice: ${(TTS_VOICE_PROFILES[niche] ?? DEFAULT_TTS_VOICE_PROFILE).voice}`);
    const result = await generateSlideAudio(slides[i], niche);
    console.log(`[TTS] Slide ${i + 1}: ${(result.durationEstimateMs / 1000).toFixed(1)}s`);
    results.push(result);
  }

  const totalMs = results.reduce((sum, r) => sum + r.durationEstimateMs, 0);
  console.log(`[TTS] Total estimated duration: ${(totalMs / 1000).toFixed(1)}s`);

  return results;
}