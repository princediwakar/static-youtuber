// Path: lib/constants.ts

export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'english_shots';

export const NICHE = 'psychology';

export const SLIDE_COUNT = { min: 7, max: 9 } as const;

// Gemini Imagen 3
export const IMAGEN_MODEL = 'imagen-4.0-generate-001';
export const IMAGEN_ASPECT_RATIO = '9:16';
export const IMAGE_CONCURRENCY = 3; // parallel Imagen calls per job

// Gemini TTS
export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
export const TTS_VOICE = 'Charon'; // deep, calm, authoritative narrator
export const TTS_CONCURRENCY = 4;

// DeepSeek
export const DEEPSEEK_MODEL = 'deepseek-chat';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

// FFmpeg quality
export const FFMPEG_CRF = '18';
export const FFMPEG_PRESET = 'slow';
export const FFMPEG_AUDIO_BITRATE = '192k';
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;

// Thumbnail
export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;

// Cloudinary
export const CLOUDINARY_FOLDER = 'ai-slideshow';
export const CLOUDINARY_EXPIRE_DAYS = 7;

// Image style prefix injected into every slide image_prompt
export const IMAGE_STYLE_PREFIX =
  'cute minimal cartoon illustration, light pastel background, lots of white space, simple flat shapes, friendly playful style, soft colors, no text, airy and clean, like a children\'s editorial illustration,';

// Thumbnail style prefix
export const THUMBNAIL_STYLE_PREFIX =
  'bold cartoonish editorial illustration, bright cheerful background, high contrast, simple graphic style, bold playful typography-friendly composition, no text in image,';
