// Path: lib/types.ts

export interface Slide {
  text: string;         // Sentence read aloud & displayed
  image_prompt: string; // Sent to Gemini Imagen 3
  imageUrl?: string;    // Cloudinary URL after generation
  audioUrl?: string;    // Cloudinary URL of TTS clip for this slide
}

export interface SlideshowScript {
  title: string;
  description: string;
  tags: string[];
  slides: Slide[];
  thumbnailPrompt: string;
}

export interface SlideshowJob {
  id: string;
  account_id: string;
  topic: string;
  niche: string;
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
  slide_image_urls?: string[];
  slide_audio_urls?: string[];
  video_url?: string;
  thumbnail_url?: string;
  youtube_video_id?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface SlideshowTopic {
  id: number;
  topic: string;
  niche: string;
  used: boolean;
  used_at?: string;
}

export interface SlideshowUpload {
  id: number;
  job_id: string;
  youtube_video_id: string;
  title: string;
  description?: string;
  tags: string[];
  uploaded_at: string;
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
