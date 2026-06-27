// Path: lib/ttsGenerator.ts
import {
  type TTSVoiceProfile,
} from './constants';

export function buildTTSPrompt(profile: TTSVoiceProfile, slideText: string, audioTag: string): string {
  const tag = audioTag.trim();
  return `${profile.directorNotes}\n\n### TRANSCRIPT\n${tag} ${slideText}`;
}

