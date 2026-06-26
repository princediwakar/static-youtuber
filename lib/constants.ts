// Path: lib/constants.ts
import path from 'path';

export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'english_shots';

export const NICHES = ['Modern Indian History', 'Geography'];
export const FORMATS = ['story', 'quiz', 'facts'];

export const SLIDE_COUNT = 6; 

export const IMAGE_MODEL = 'gemini-2.5-flash-image';
export const IMAGE_MODEL_THUMBNAIL = 'gemini-3.1-flash-image';
export const IMAGE_ASPECT_RATIO = '9:16';

export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
export const TTS_VOICE = 'Charon'; 
export const TTS_SAMPLE_RATE = 24000; 

export const MUSIC_MODEL = 'lyria-3-clip-preview';
export const MODAL_RENDER_URL = process.env.MODAL_RENDER_URL || 'https://example-modal-url.com/render';
export const DEEPSEEK_MODEL = 'deepseek-chat';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export const FFMPEG_CRF = '23';       
export const FFMPEG_PRESET = 'medium'; 
export const FFMPEG_AUDIO_BITRATE = '128k'; 
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 25;           

export const ZOOMPAN_ZOOM_IN_START = 1.0;
export const ZOOMPAN_ZOOM_IN_END = 1.10;   
export const ZOOMPAN_ZOOM_OUT_START = 1.10; 
export const ZOOMPAN_ZOOM_OUT_END = 1.0;
export const ZOOMPAN_SPEED = 0.0007; 

export const XFADE_DURATION = 0;
export const XFADE_TRANSITIONS = [
  'fade', 'slideleft', 'slideup', 'wiperight', 'smoothleft', 'circlecrop',
] as const;

export const MUSIC_VOLUME = 0.35; 
export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
export const MUSIC_FILES = ['focus-01.mp3', 'tension-01.mp3', 'ambient-01.mp3'];
export const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';

export const CAPTION_FONT_SIZE = 92; 
export const CAPTION_MAX_CHARS_PER_LINE = 18;
export const CAPTION_Y_POSITION = 0.80; 
export const CAPTION_LINE_HEIGHT = 110;
export const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'Montserrat-Bold.ttf');

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;
export const CLOUDINARY_FOLDER = 'ai-slideshow';
export const CLOUDINARY_EXPIRE_DAYS = 7;

// Dynamic Aesthetics Array for A/B Testing
export const AESTHETICS = [
  {
    id: 'dossier',
    instruction: 'All images must feel like a premium, dark, cinematic classified dossier.',
    imagePrefix: 'vintage archival photograph, high contrast black and white, heavily textured film grain, declassified document style, blueprint elements, ominous lighting, no text in image, ',
    thumbnailPrefix: 'vintage archival photograph, declassified document style, high-quality, striking contrast, no text in image, '
  },
  {
    id: 'vector',
    instruction: 'All images must feel like a premium, high-budget educational vector animation (like Kurzgesagt or Vox).',
    imagePrefix: 'premium 2D vector flat art, Kurzgesagt style, dramatic isometric perspective, limited bold color palette, clean geometric shapes, dramatic lighting, no text in image, ',
    thumbnailPrefix: 'premium 2D vector flat art, Kurzgesagt style, bold colors, high-quality, striking contrast, no text in image, '
  }
];