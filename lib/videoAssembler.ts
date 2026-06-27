// Path: lib/videoAssembler.ts
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import { promises as fs, existsSync, symlinkSync, unlinkSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { downloadAsBuffer } from './cloudinary';
import { TTS_SAMPLE_RATE } from './constants';
import {
  FFMPEG_CRF,
  FFMPEG_PRESET,
  FFMPEG_AUDIO_BITRATE,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
  VIDEO_FPS,
  ZOOMPAN_SPEED,
  ZOOMPAN_ZOOM_IN_START,
  ZOOMPAN_ZOOM_IN_END,
  ZOOMPAN_ZOOM_OUT_START,
  ZOOMPAN_ZOOM_OUT_END,
} from './constants';

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

// Instead of shipping a separate ~75 MB ffprobe binary, symlink ffprobe → ffmpeg.
// FFmpeg's binary auto-detects argv[0] — if invoked as "ffprobe", it acts as ffprobe.
let ffprobeReady = false;
function ensureFfprobe(): void {
  if (ffprobeReady) return;
  const linkPath = path.join(tmpdir(), 'ffprobe-slideshow');
  try {
    if (existsSync(linkPath)) unlinkSync(linkPath);
    symlinkSync(ffmpegStatic!, linkPath);
    ffmpeg.setFfprobePath(linkPath);
  } catch {
    console.warn('[Assembler] ffprobe symlink failed — metadata probes may use slower fallback');
    ffmpeg.setFfprobePath(ffmpegStatic!);  // fallback: try the ffmpeg binary directly
  }
  ffprobeReady = true;
}

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

// ─── Per-shot clip with Ken Burns zoompan ─────────────────────────────────────

/**
 * Build one shot clip: still image + PCM audio → MP4.
 * Applies Ken Burns zoom: even-index shots zoom IN, odd-index zoom OUT.
 * This alternation creates a push-pull visual rhythm that prevents the brain
 * from habituating to the motion — matching the "pattern break every 3-5s" principle.
 */
async function buildShotClip(
  imagePath: string,
  audioPath: string,
  outputPath: string,
  shotIndex: number
): Promise<void> {
  // Zoom direction alternates per shot
  // Even: 1.0 → 1.12 (zoom in)  Odd: 1.12 → 1.0 (zoom out)
  const zoomStart = shotIndex % 2 === 0 ? ZOOMPAN_ZOOM_IN_START : ZOOMPAN_ZOOM_OUT_START;
  // zoompan expressions: 'on' = output frame number
  const zoomExpr = shotIndex % 2 === 0
    ? `min(${zoomStart}+${ZOOMPAN_SPEED}*on, ${ZOOMPAN_ZOOM_IN_END})`
    : `max(${ZOOMPAN_ZOOM_OUT_END}, ${ZOOMPAN_ZOOM_OUT_START}-${ZOOMPAN_SPEED}*on)`;

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

// ─── Concat assembly ──────────────────────────────────────────────────────────

/**
 * Assemble N clips into a single video using the FFmpeg concat filter.
 * Uses the concat filter (not demuxer) for frame-accurate gapless audio —
 * the demuxer can introduce priming-sample gaps at clip boundaries.
 * Requires video re-encode (no stream copy), but for short-form content
 * the encode time is negligible and the audio continuity is worth it.
 */
async function assembleClips(
  clipPaths: string[],
  outputPath: string
): Promise<void> {
  if (clipPaths.length === 1) {
    await fs.copyFile(clipPaths[0], outputPath);
    return;
  }

  console.log(`[Assembler] Assembling ${clipPaths.length} clips using concat filter (gapless audio, video re-encode)…`);

  // Build filter: [0:v][0:a][1:v][1:a]...[N:v][N:a]concat=n=N:v=1:a=1[v][a]
  const filterInputs = clipPaths.map((_, i) => `[${i}:v][${i}:a]`).join('');
  const filterGraph = `${filterInputs}concat=n=${clipPaths.length}:v=1:a=1[v][a]`;

  const cmd = ffmpeg();
  for (const clipPath of clipPaths) {
    cmd.input(clipPath);
  }

  await runFfmpeg(
    cmd
      .complexFilter([filterGraph])
      .outputOptions([
        '-map [v]',
        '-map [a]',
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

// ─── Background music mix with sidechain compression ──────────────────────────

/**
 * Mix background music into an assembled video using sidechain compression.
 * The music ducks (reduces volume) when TTS voiceover is speaking, then
 * recovers to full volume during pauses — creating a professional podcast-style mix.
 * Loops the music to fill the full video duration; stops when video ends (-shortest).
 */
async function mixBackgroundMusic(
  videoPath: string,
  musicUrl: string,
  outputPath: string
): Promise<void> {
  // Download music from Cloudinary URL
  const musicBuffer = await downloadAsBuffer(musicUrl);
  const musicPath = path.join(path.dirname(outputPath), 'music.mp3');
  await fs.writeFile(musicPath, musicBuffer);

  // Sidechain compression: music ducks when TTS is speaking
  // threshold=0.04: music ducks when voice exceeds -28 dBFS (sensitive enough for spoken word)
  // ratio=4: moderate 4:1 compression
  // attack=5ms: fast ducking to catch consonants
  // release=50ms: smooth recovery between words
  await runFfmpeg(
    ffmpeg()
      .input(videoPath)
      .input(musicPath)
      .inputOptions(['-stream_loop', '-1'])
      .complexFilter([
        '[1:a]asplit[mus1][mus2];[0:a][mus1]sidechaincompress=threshold=0.04:ratio=4:attack=5:release=50[spoken_ducked];[spoken_ducked][mus2]amix=inputs=2:duration=first:dropout_transition=2'
      ])
      .outputOptions([
        '-map 0:v',
        '-c:v copy',
        '-c:a aac',
        `-b:a ${FFMPEG_AUDIO_BITRATE}`,
        '-shortest',
        '-movflags +faststart',
      ])
      .output(outputPath)
  );

  console.log('[Assembler] Music mixed in with sidechain compression (ducking)');
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Full pipeline:
 *   1. Download all shot images + audio from Cloudinary
 *   2. Build per-shot clips with alternating Ken Burns zoompan
 *   3. Assemble with hard cuts (concat filter, no crossfade — MrBeast-style zero dead air)
 *   4. Mix in background music with sidechain compression (audio ducking)
 *   5. Return final MP4 buffer
 */
export async function assembleVideo(
  imageUrls: string[],
  audioUrls: string[],
  musicUrl: string,
  jobId: string
): Promise<Buffer> {
  ensureFfprobe();

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
        const p = path.join(workDir, `shot-${i}.png`);
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

    // Build per-shot clips with alternating Ken Burns (sequential — FFmpeg is CPU-bound)
    for (let i = 0; i < imagePaths.length; i++) {
      const clipPath = path.join(workDir, `clip-${i}.mp4`);
      console.log(`[Assembler] Building clip ${i + 1}/${imagePaths.length} (zoom ${i % 2 === 0 ? 'IN' : 'OUT'})…`);
      await buildShotClip(imagePaths[i], audioPaths[i], clipPath, i);
      clipPaths.push(clipPath);
    }

    // Assemble sequentially using concat filter
    const assembledPath = path.join(workDir, 'assembled.mp4');
    await assembleClips(clipPaths, assembledPath);

    // Mix in background music with sidechain compression
    const finalPath = path.join(workDir, 'final.mp4');
    console.log('[Assembler] Mixing background music with sidechain compression…');
    await mixBackgroundMusic(assembledPath, musicUrl, finalPath);

    const videoBuffer = await fs.readFile(finalPath);
    console.log(`[Assembler] ✅ Final video: ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`);
    return videoBuffer;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => null);
  }
}
