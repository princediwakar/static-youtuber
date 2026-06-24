// Path: lib/youtubeUpload.ts
import { google } from 'googleapis';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { v4 as uuidv4 } from 'uuid';
import { AccountCredentials } from './types';
import { SlideshowScript } from './types';

// ─── Auth ─────────────────────────────────────────────────────────────────────

function buildOAuth2Client(creds: AccountCredentials) {
  const oauth2 = new google.auth.OAuth2(
    creds.googleClientId,
    creds.googleClientSecret,
    process.env.NEXTAUTH_URL
      ? `${process.env.NEXTAUTH_URL}/api/auth/callback/google`
      : 'http://localhost:3000/api/auth/callback/google'
  );
  oauth2.setCredentials({ refresh_token: creds.refreshToken });
  return oauth2;
}

// ─── Upload ────────────────────────────────────────────────────────────────────

export interface UploadResult {
  youtubeVideoId: string;
  title: string;
  description: string;
}

/**
 * Downloads the assembled MP4 from Cloudinary, writes it to a temp file,
 * uploads it to YouTube, uploads the thumbnail, then cleans up.
 */
export async function uploadToYouTube(
  videoUrl: string,
  thumbnailBuffer: Buffer,
  script: SlideshowScript,
  creds: AccountCredentials
): Promise<UploadResult> {
  const oauth2 = buildOAuth2Client(creds);
  const youtube = google.youtube({ version: 'v3', auth: oauth2 });

  // Download MP4 from Cloudinary
  console.log('[YouTube] Downloading video from Cloudinary…');
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.statusText}`);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

  // Write to temp file (YouTube API requires a readable stream / file path)
  const tempVideo = path.join(tmpdir(), `yt-upload-${uuidv4()}.mp4`);
  const tempThumb = path.join(tmpdir(), `yt-thumb-${uuidv4()}.png`);

  try {
    await fs.writeFile(tempVideo, new Uint8Array(videoBuffer));
    await fs.writeFile(tempThumb, new Uint8Array(thumbnailBuffer));

    const title = `${script.title} #Shorts`.substring(0, 100);
    const description = buildDescription(script);

    console.log(`[YouTube] Uploading: "${title}"…`);
    const uploadRes = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title,
          description,
          tags: script.tags,
          categoryId: '27', // Education
        },
        status: {
          privacyStatus: 'public',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: require('fs').createReadStream(tempVideo),
      },
    });

    const videoId = uploadRes.data.id;
    if (!videoId) throw new Error('YouTube API returned no video ID');
    console.log(`[YouTube] Uploaded: https://www.youtube.com/watch?v=${videoId}`);

    // Upload thumbnail (best-effort — channels need 1000 subs for custom thumbs)
    try {
      await youtube.thumbnails.set({
        videoId,
        media: {
          body: require('fs').createReadStream(tempThumb),
          mimeType: 'image/png',
        },
      });
      console.log(`[YouTube] Thumbnail set for ${videoId}`);
    } catch (err) {
      console.warn('[YouTube] Thumbnail upload skipped:', err instanceof Error ? err.message : err);
    }

    return { youtubeVideoId: videoId, title, description };
  } finally {
    await fs.unlink(tempVideo).catch(() => null);
    await fs.unlink(tempThumb).catch(() => null);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDescription(script: SlideshowScript): string {
  const hashtags = '#psychology #psychologyfacts #mindset #mentalhealthawareness #brainfacts #Shorts';
  const cta =
    '\n\n🔔 Subscribe for daily psychology facts!\n💬 Comment which fact surprised you most!\n🔁 Share with someone who needs to see this!';
  return `${script.description}\n\n${cta}\n\n${hashtags}`.substring(0, 5000);
}
