// Path: lib/videoAssembler.ts
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { downloadAsBuffer } from './cloudinary';
import {
  FFMPEG_CRF,
  FFMPEG_PRESET,
  FFMPEG_AUDIO_BITRATE,
  VIDEO_WIDTH,
  VIDEO_HEIGHT,
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

/** Combine a single image + audio clip into a per-slide MP4 */
async function buildSlideClip(
  imagePath: string,
  audioPath: string,
  outputPath: string
): Promise<void> {
  await runFfmpeg(
    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop 1'])
      .input(audioPath)
      .outputOptions([
        '-c:v libx264',
        `-crf ${FFMPEG_CRF}`,
        `-preset ${FFMPEG_PRESET}`,
        '-pix_fmt yuv420p',
        '-c:a aac',
        `-b:a ${FFMPEG_AUDIO_BITRATE}`,
        '-shortest',             // clip length = audio duration
        '-movflags +faststart',
      ])
      .size(`${VIDEO_WIDTH}x${VIDEO_HEIGHT}`)
      .output(outputPath)
  );
}

/** Concatenate an ordered list of MP4 clips into the final video */
async function concatClips(clipPaths: string[], outputPath: string): Promise<void> {
  // Write a concat list file
  const listContent = clipPaths.map(p => `file '${p}'`).join('\n');
  const listPath = path.join(tmpdir(), `concat-${uuidv4()}.txt`);
  await fs.writeFile(listPath, listContent);

  try {
    await runFfmpeg(
      ffmpeg()
        .input(listPath)
        .inputOptions(['-f concat', '-safe 0'])
        .outputOptions([
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
  } finally {
    await fs.unlink(listPath).catch(() => null);
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Downloads all slide images + audio from Cloudinary, builds per-slide clips,
 * concatenates them, and returns the final MP4 as a Buffer.
 */
export async function assembleVideo(
  imageUrls: string[],
  audioUrls: string[],
  jobId: string
): Promise<Buffer> {
  if (imageUrls.length !== audioUrls.length) {
    throw new Error(
      `Mismatch: ${imageUrls.length} images vs ${audioUrls.length} audio clips`
    );
  }

  const workDir = path.join(tmpdir(), `slideshow-${jobId}-${uuidv4()}`);
  await fs.mkdir(workDir, { recursive: true });

  const clipPaths: string[] = [];

  try {
    console.log(`[Assembler] Downloading ${imageUrls.length} assets for job ${jobId}…`);

    // Download all images + audio in parallel
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
        const p = path.join(workDir, `audio-${i}.wav`);
        await fs.writeFile(p, buf);
        return p;
      })
    );

    // Build per-slide clips sequentially (FFmpeg is CPU-bound; parallel kills RAM)
    for (let i = 0; i < imagePaths.length; i++) {
      const clipPath = path.join(workDir, `clip-${i}.mp4`);
      console.log(`[Assembler] Building clip ${i + 1}/${imagePaths.length}…`);
      await buildSlideClip(imagePaths[i], audioPaths[i], clipPath);
      clipPaths.push(clipPath);
    }

    // Concatenate
    const finalPath = path.join(workDir, 'final.mp4');
    console.log(`[Assembler] Concatenating ${clipPaths.length} clips…`);
    await concatClips(clipPaths, finalPath);

    const videoBuffer = await fs.readFile(finalPath);
    console.log(`[Assembler] Final video: ${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`);
    return videoBuffer;
  } finally {
    // Clean up all temp files
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => null);
  }
}
