// Path: lib/videoAssembler.ts
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { existsSync, readdirSync } from 'fs';
import { downloadAsBuffer } from './cloudinary';
import { TTS_SAMPLE_RATE } from './ttsGenerator';
import {
  FFMPEG_CRF,
  FFMPEG_PRESET,
  FFMPEG_AUDIO_BITRATE,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  VIDEO_FPS,
  ZOOMPAN_SPEED,
  ZOOMPAN_ZOOM_IN_START,
  ZOOMPAN_ZOOM_OUT_START,
  ZOOMPAN_ZOOM_OUT_END,
  XFADE_DURATION,
  MUSIC_DIR,
  MUSIC_FILES,
  MUSIC_VOLUME,
} from './constants';

ffmpeg.setFfmpegPath(ffmpegPath.path);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command
      .on('end', () => resolve())
      .on('error', (err, stdout, stderr) => {
        console.error('[FFmpeg] stdout:', stdout);
        console.error('[FFmpeg] stderr:', stderr);
        reject(new Error(`FFmpeg failed: ${err.message}`));
      })
      .run();
  });
}

/** Probe a media file and return its duration in seconds */
function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      const duration = metadata?.format?.duration;
      if (!duration) return reject(new Error(`Could not probe duration of ${filePath}`));
      resolve(duration);
    });
  });
}

/**
 * Pick a random background music track from the assets/music directory.
 * Returns null if no music files are available (pipeline still works without music).
 */
function pickMusicTrack(): string | null {
  if (!existsSync(MUSIC_DIR)) return null;
  const available = MUSIC_FILES.filter(f => existsSync(path.join(MUSIC_DIR, f)));
  if (available.length === 0) return null;
  const chosen = available[Math.floor(Math.random() * available.length)];
  console.log(`[Assembler] Background music: ${chosen}`);
  return path.join(MUSIC_DIR, chosen);
}

// ─── Per-slide clip with Ken Burns zoompan ────────────────────────────────────

/**
 * Build one slide clip: still image + PCM audio → MP4.
 * Applies Ken Burns zoom: even-index slides zoom IN, odd-index zoom OUT.
 * This alternation creates a push-pull visual rhythm that prevents the brain
 * from habituating to the motion — matching the "pattern break every 3-5s" principle.
 */
async function buildSlideClip(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  slideIndex: number
): Promise<void> {
  // Zoom direction alternates per slide
  // Even: 1.0 → 1.06 (zoom in)  Odd: 1.06 → 1.0 (zoom out)
  const zoomStart = slideIndex % 2 === 0 ? ZOOMPAN_ZOOM_IN_START : ZOOMPAN_ZOOM_OUT_START;
  const zoomDirection = slideIndex % 2 === 0 ? '+' : '-';
  // zoompan expressions: 'on' = output frame number
  const zoomExpr = slideIndex % 2 === 0
    ? `min(${zoomStart}+${ZOOMPAN_SPEED}*on, ${ZOOMPAN_ZOOM_OUT_START})`  // cap at 1.06
    : `max(${ZOOMPAN_ZOOM_OUT_END}, ${ZOOMPAN_ZOOM_OUT_START}-${ZOOMPAN_SPEED}*on)`;  // floor at 1.0

  const zoompanFilter = [
    `zoompan=z='${zoomExpr}'`,
    `x='iw/2-(iw/zoom/2)'`,
    `y='ih/2-(ih/zoom/2)'`,
    `d=99999`,              // run indefinitely; -shortest stops it when audio ends
    `s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}`,
    `fps=${VIDEO_FPS}`,
  ].join(':');

  await runFfmpeg(
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop 1'])
      .input(audioPath)
      .inputOptions(['-f', 's16le', '-ar', `${TTS_SAMPLE_RATE}`, '-ac', '1'])
      .videoFilter(zoompanFilter)
      .outputOptions([
        '-c:v libx264',
        `-crf ${FFMPEG_CRF}`,
        `-preset ${FFMPEG_PRESET}`,
        '-pix_fmt yuv420p',
        '-c:a aac',
        `-b:a ${FFMPEG_AUDIO_BITRATE}`,
        '-shortest',
        '-movflags +faststart',
      ])
      .output(outputPath)
  );
}

// ─── xfade assembly ───────────────────────────────────────────────────────────

/**
 * Assemble N clips into a single video using xfade (video) + acrossfade (audio).
 * This produces seamless 0.3s crossfades between every slide — both picture and sound.
 *
 * Algorithm:
 *   1. Probe each clip's duration
 *   2. Calculate xfade offsets: offset_n = sum(durations[0..n-1]) - n * XFADE_DURATION
 *   3. Build filter_complex string chaining [0:v][1:v]xfade... [0:a][1:a]acrossfade...
 *   4. Run single FFmpeg command with all clips as inputs
 */
async function assembleWithTransitions(
  clipPaths: string[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 1) {
    // Single clip — just copy it
    await fs.copyFile(clipPaths[0], outputPath);
    return;
  }

  // Step 1: Probe durations
  console.log(`[Assembler] Probing ${clipPaths.length} clip durations for xfade offsets…`);
  const durations = await Promise.all(clipPaths.map(p => probeDuration(p)));

  // Step 2: Calculate xfade offsets
  const offsets: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < durations.length - 1; i++) {
    cumulative += durations[i] - XFADE_DURATION;
    offsets.push(Math.max(0, cumulative));
  }

  // Step 3: Build filter_complex for video (xfade) and audio (acrossfade)
  const n = clipPaths.length;
  const vFilters: string[] = [];
  const aFilters: string[] = [];

  // Chain video xfades
  let prevVLabel = '[0:v]';
  for (let i = 0; i < n - 1; i++) {
    const outLabel = i === n - 2 ? '[vfinal]' : `[v${i}${i + 1}]`;
    vFilters.push(
      `${prevVLabel}[${i + 1}:v]xfade=transition=fade:duration=${XFADE_DURATION}:offset=${offsets[i].toFixed(3)}${outLabel}`
    );
    prevVLabel = outLabel === '[vfinal]' ? '[vfinal]' : outLabel;
  }

  // Chain audio acrossfades
  let prevALabel = '[0:a]';
  for (let i = 0; i < n - 1; i++) {
    const outLabel = i === n - 2 ? '[afinal]' : `[a${i}${i + 1}]`;
    aFilters.push(
      `${prevALabel}[${i + 1}:a]acrossfade=d=${XFADE_DURATION}${outLabel}`
    );
    prevALabel = outLabel === '[afinal]' ? '[afinal]' : outLabel;
  }

  const filterComplex = [...vFilters, ...aFilters].join('; ');

  // Step 4: Build and run the FFmpeg command
  const cmd = ffmpeg();
  clipPaths.forEach(p => cmd.input(p));

  await runFfmpeg(
    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        '-map [vfinal]',
        '-map [afinal]',
        '-c:v libx264',
        `-crf ${FFMPEG_CRF}`,
        `-preset ${FFMPEG_PRESET}`,
        '-pix_fmt yuv420p',
        '-c:a aac',
        `-b:a ${FFMPEG_AUDIO_BITRATE}`,
        '-movflags +faststart',
      ])
      .output(outputPath)
  );
}

// ─── Background music mix ─────────────────────────────────────────────────────

/**
 * Mix background music into an assembled video.
 * Music loops to fill the full video duration, mixed at MUSIC_VOLUME (18%).
 * Returns the original videoPath unchanged if no music track is available.
 */
async function mixBackgroundMusic(
  videoPath: string,
  outputPath: string
): Promise<void> {
  const musicTrack = pickMusicTrack();

  if (!musicTrack) {
    console.log('[Assembler] No music tracks found in assets/music/ — skipping music mix.');
    await fs.copyFile(videoPath, outputPath);
    return;
  }

  // amix: input 0 = voice audio (weight 1), input 1 = music (weight MUSIC_VOLUME)
  // -stream_loop -1: loop the music track to fill the video length
  // -shortest: stop when the video ends
  await runFfmpeg(
    ffmpeg()
      .input(videoPath)
      .input(musicTrack)
      .inputOptions(['-stream_loop', '-1'])
      .complexFilter([
        `[0:a][1:a]amix=inputs=2:weights=1 ${MUSIC_VOLUME}:normalize=0[amixed]`,
      ])
      .outputOptions([
        '-map 0:v',        // copy video stream from assembled video
        '-map [amixed]',   // mixed audio
        '-c:v copy',       // no video re-encode — fast
        '-c:a aac',
        `-b:a ${FFMPEG_AUDIO_BITRATE}`,
        '-shortest',
        '-movflags +faststart',
      ])
      .output(outputPath)
  );

  console.log(`[Assembler] Music mixed in at ${Math.round(MUSIC_VOLUME * 100)}% volume`);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Full pipeline:
 *   1. Download all slide images + audio from Cloudinary
 *   2. Build per-slide clips with alternating Ken Burns zoompan
 *   3. Assemble with xfade/acrossfade transitions
 *   4. Mix in background music
 *   5. Return final MP4 buffer
 */
export async function assembleVideo(
  imageUrls: string[],
  audioUrls: string[],
  jobId: string
): Promise<Buffer> {
  if (imageUrls.length !== audioUrls.length) {
    throw new Error(`Mismatch: ${imageUrls.length} images vs ${audioUrls.length} audio clips`);
  }

  const workDir = path.join(tmpdir(), `slideshow-${jobId}-${uuidv4()}`);
  await fs.mkdir(workDir, { recursive: true });

  const clipPaths: string[] = [];

  try {
    console.log(`[Assembler] Downloading ${imageUrls.length} assets for job ${jobId}…`);

    const [imageBuffers, audioBuffers] = await Promise.all([
      Promise.all(imageUrls.map(url => downloadAsBuffer(url))),
      Promise.all(audioUrls.map(url => downloadAsBuffer(url))),
    ]);

    // Write to disk
    const imagePaths = await Promise.all(
      imageBuffers.map(async (buf, i) => {
        const p = path.join(workDir, `slide-${i}.png`);
        await fs.writeFile(p, buf);
        return p;
      })
    );
    const audioPaths = await Promise.all(
      audioBuffers.map(async (buf, i) => {
        const p = path.join(workDir, `audio-${i}.pcm`);
        await fs.writeFile(p, buf);
        return p;
      })
    );

    // Build per-slide clips with alternating Ken Burns (sequential — FFmpeg is CPU-bound)
    for (let i = 0; i < imagePaths.length; i++) {
      const clipPath = path.join(workDir, `clip-${i}.mp4`);
      console.log(`[Assembler] Building clip ${i + 1}/${imagePaths.length} (zoom ${i % 2 === 0 ? 'IN' : 'OUT'})…`);
      await buildSlideClip(imagePaths[i], audioPaths[i], clipPath, i);
      clipPaths.push(clipPath);
    }

    // Assemble with xfade transitions
    const assembledPath = path.join(workDir, 'assembled.mp4');
    console.log(`[Assembler] Assembling ${clipPaths.length} clips with xfade transitions…`);
    await assembleWithTransitions(clipPaths, assembledPath);

    // Mix in background music
    const finalPath = path.join(workDir, 'final.mp4');
    console.log('[Assembler] Mixing background music…');
    await mixBackgroundMusic(assembledPath, finalPath);

    const videoBuffer = await fs.readFile(finalPath);
    console.log(`[Assembler] ✅ Final video: ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`);
    return videoBuffer;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => null);
  }
}
