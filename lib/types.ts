// Path: lib/types.ts

export interface Shot {
  id: number;
  visual_prompt: string;
  caption_text: string;
  spoken_text: string;
  is_conclusion: boolean;
  duration_seconds?: number;
  imageUrl?: string;
  audioUrl?: string;
}

export type ContentType = 'shorts' | 'long';

export type SlideshowScript = {
  title: string;
  description: string;
  visual_world: 'history-cinematic' | 'learn-technical' | 'industrial-wealth' | 'raw-rebuild' | 'clinical-architectural';
  format_template: 'RAPID_FIRE' | 'SLOW_BURN' | 'THE_LIST' | 'DEEP_DIVE';
  fact_check_and_sources: string;
  tags: string[];
  shots: Shot[];
  thumbnailPrompt: string;
  hook_intro: string;
  voiceName: string;
  /** Set to 'long' by generateLongFormScript; undefined / 'shorts' for standard pipeline. */
  contentType?: ContentType;
};

export interface SlideshowJob {
  id: string;
  account_id: string;
  topic: string;
  niche: string;
  format_template: string;
  content_type: ContentType;
  status:
    | 'pending'
    | 'script_ready'
    | 'generating'
    | 'images_done'
    | 'tts_done'
    | 'assets_ready'
    | 'assembled'
    | 'uploaded'
    | 'published'
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
  youtubeChannelId: string;
  googleClientId: string;
  googleClientSecret: string;
  refreshToken: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
}
