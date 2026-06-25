// Path: lib/constants.ts
import path from 'path';

export const ACCOUNT_ID = process.env.ACCOUNT_ID || 'english_shots';

export const NICHES = ['history', 'geography', 'science', 'mythology', 'english', 'physics', 'engineering'];
export const FORMATS = ['story', 'quiz', 'facts'];

export const SLIDE_COUNT = 5; // always exactly 5: 4 content slides + 1 CTA

// Gemini Image Model
export const IMAGE_MODEL = 'gemini-2.5-flash-image';
export const IMAGE_ASPECT_RATIO = '9:16';

// Gemini TTS
// Gemini TTS
export const TTS_MODEL = 'gemini-3.1-flash-tts-preview';
export const TTS_VOICE = 'Puck'; // natural, conversational — less exaggerated
export const TTS_SAMPLE_RATE = 24000; // Gemini TTS outputs 24kHz mono 16-bit PCM

// Music Model
export const MUSIC_MODEL = 'lyria-3-clip-preview';

// Modal Rendering
export const MODAL_RENDER_URL = process.env.MODAL_RENDER_URL || 'https://example-modal-url.com/render';

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
export const MUSIC_VOLUME = 0.35; // 35% — increased volume
export const MUSIC_DIR = path.join(process.cwd(), 'assets', 'music');
export const MUSIC_FILES = ['focus-01.mp3', 'tension-01.mp3', 'ambient-01.mp3'];
// CC BY 4.0 — must be included in YouTube video descriptions
export const MUSIC_ATTRIBUTION = 'Music by Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0 License http://creativecommons.org/licenses/by/4.0/';


// Captions
export const CAPTION_FONT_SIZE = 86;
export const CAPTION_MAX_CHARS_PER_LINE = 18;
export const CAPTION_Y_POSITION = 0.80; // 80% down the frame (bottom, but safe from clipping)
export const CAPTION_LINE_HEIGHT = 110;
export const FONT_PATH = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansDevanagari-Bold.ttf');

// Thumbnail
export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;

// Cloudinary
export const CLOUDINARY_FOLDER = 'ai-slideshow';
export const CLOUDINARY_EXPIRE_DAYS = 7;

// Image style prefix — minimal cartoonish illustration
export const IMAGE_STYLE_PREFIX =
  'minimal cartoonish illustration, vector art style, flat colors, humorous and expressive characters, simple backgrounds, clean lines, OverSimplified style, Indian characters and motifs, no text, high quality,';

// Thumbnail style prefix
export const THUMBNAIL_STYLE_PREFIX =
  'bold minimal cartoonish illustration, expressive humorous Indian characters, flat colors, vector art style, clean lines, high contrast, no text in image, YouTube thumbnail quality,';
