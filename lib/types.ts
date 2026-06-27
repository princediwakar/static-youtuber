// Path: lib/types.ts

export interface Shot {
  id: number;
  visual_prompt: string;
  tts_text: string;
  audio_instruction?: '[serious]' | '[curious]' | '[urgent]' | '[measured]' | '[grave]';
  is_conclusion: boolean;
  duration_seconds?: number;
  imageUrl?: string;
  audioUrl?: string;
}

export type SlideshowScript = {
  title: string;
  description: string;
  visual_world: 'vector' | 'dossier' | 'dark_cinematic' | 'tactical';
  format_template: 'RAPID_FIRE' | 'SLOW_BURN' | 'THE_LIST';
  fact_check_and_sources: string;
  tags: string[];
  shots: Shot[];
  thumbnailPrompt: string;
  hook_intro: string;
};

export interface SlideshowJob {
  id: string;
  account_id: string;
  topic: string;
  niche: string;
  format_template: string;
  status:
    | 'pending'
    | 'generating'
    | 'images_done'
    | 'tts_done'
    | 'assembled'
    | 'uploaded'
    | 'failed';
  inngest_run_id?: string;
  script?: SlideshowScript;
  shot_image_urls?: string[];
  shot_audio_urls?: string[];
  video_url?: string;
  thumbnail_url?: string;
  youtube_video_id?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface AccountCredentials {
  id: string;
  googleClientId: string;
  googleClientSecret: string;
  refreshToken: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
}
