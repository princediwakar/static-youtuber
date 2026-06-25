// Path: lib/constants.ts
import path from 'path';

export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'english_shots';

export const NICHE = 'history';

export const SLIDE_COUNT = 9; // always exactly 9: 8 content slides + 1 CTA

// Gemini Imagen 3
export const IMAGEN_MODEL = 'imagen-4.0-generate-001';
export const IMAGEN_ASPECT_RATIO = '9:16';
export const IMAGE_CONCURRENCY = 3;

// Gemini TTS
export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
export const TTS_VOICE = 'Fenrir'; // deep, authoritative male — perfect for history narration
export const TTS_CONCURRENCY = 4;
// SSML speech rates — hook slide lands slower, rest is energetic
export const TTS_RATE_HOOK = '1.0';   // slide 0: measured, lands the open loop
export const TTS_RATE_DEFAULT = '1.1'; // slides 1-8: slightly fast, keeps energy up

// DeepSeek
export const DEEPSEEK_MODEL = 'deepseek-chat';
export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

// FFmpeg quality
export const FFMPEG_CRF = '23';       // YouTube re-encodes everything — CRF 18 was wasted quality
export const FFMPEG_PRESET = 'medium'; // 3x faster encode, imperceptible delta after YouTube re-encode
export const FFMPEG_AUDIO_BITRATE = '128k'; // Mono voice at 24kHz — 128k is transparent
export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 25;           // Ken Burns on stills doesn't benefit from 30fps

// Ken Burns zoom — alternating direction per slide
export const ZOOMPAN_ZOOM_IN_START = 1.0;
export const ZOOMPAN_ZOOM_IN_END = 1.06;
export const ZOOMPAN_ZOOM_OUT_START = 1.06;
export const ZOOMPAN_ZOOM_OUT_END = 1.0;
export const ZOOMPAN_SPEED = 0.0006; // zoom delta per frame — doubled for perceptible motion on mobile

// xfade transition
export const XFADE_DURATION = 0.3; // seconds of crossfade between slides

// Transition variety — cycles through these to prevent visual habituation
export const XFADE_TRANSITIONS = [
  'fade',
  'slideleft',
  'slideup',
  'wiperight',
  'smoothleft',
  'circlecrop',
] as const;

// Background music
export const MUSIC_VOLUME = 0.18; // 18% — audible under voice, not distracting
export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
export const MUSIC_FILES = ['focus-01.mp3', 'tension-01.mp3', 'ambient-01.mp3'];
// CC BY 4.0 — must be included in YouTube video descriptions
export const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';


// Captions
export const CAPTION_FONT_SIZE = 72;
export const CAPTION_MAX_CHARS_PER_LINE = 22;
export const CAPTION_Y_POSITION = 0.58; // 58% down the frame (lower-center)
export const CAPTION_LINE_HEIGHT = 90;
export const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'Montserrat-Bold.ttf');

// Thumbnail
export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;

// Cloudinary
export const CLOUDINARY_FOLDER = 'ai-slideshow';
export const CLOUDINARY_EXPIRE_DAYS = 7;

// Image style prefix — cinematic historical illustration
export const IMAGE_STYLE_PREFIX =
  'epic cinematic historical illustration, dramatic golden-hour lighting, rich detailed period-accurate scene, painterly style, deep saturated colors, no text, high quality digital art,';

// Thumbnail style prefix
export const THUMBNAIL_STYLE_PREFIX =
  'bold dramatic historical illustration, dark cinematic background, intense mood, high contrast, rich colors, no text in image, movie poster quality,';
