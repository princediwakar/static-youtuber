// Path: lib/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary';
import { AccountCredentials } from './types';
import { CLOUDINARY_FOLDER, CLOUDINARY_EXPIRE_DAYS } from './constants';

function initCloudinary(creds: AccountCredentials) {
  cloudinary.config({
    cloud_name: creds.cloudinaryCloudName,
    api_key: creds.cloudinaryApiKey,
    api_secret: creds.cloudinaryApiSecret,
  });
}

function uploadFromBuffer(
  buffer: Buffer,
  folder: string,
  publicId: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<string> {
  return new Promise((resolve, reject) => {
    const expireAt = Math.floor(Date.now() / 1000) + CLOUDINARY_EXPIRE_DAYS * 24 * 60 * 60;
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        // Tag for easy bulk deletion later
        tags: [`ai-slideshow`, `expires-${new Date().toISOString().split('T')[0]}`],
        // Cloudinary doesn't support true auto-expiry on free plan via upload;
        // we handle cleanup via tagging or manual purge after upload.
        overwrite: true,
        invalidate: true,
      },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

export async function uploadSlideImage(
  buffer: Buffer,
  jobId: string,
  slideIndex: number,
  creds: AccountCredentials
): Promise<string> {
  initCloudinary(creds);
  return uploadFromBuffer(
    buffer,
    `${CLOUDINARY_FOLDER}/${jobId}`,
    `slide-${slideIndex}`,
    'image'
  );
}

export async function uploadSlideAudio(
  buffer: Buffer,
  jobId: string,
  slideIndex: number,
  creds: AccountCredentials
): Promise<string> {
  initCloudinary(creds);
  return uploadFromBuffer(
    buffer,
    `${CLOUDINARY_FOLDER}/${jobId}`,
    `audio-${slideIndex}`,
    'raw'
  );
}

export async function uploadVideo(
  buffer: Buffer,
  jobId: string,
  creds: AccountCredentials
): Promise<string> {
  initCloudinary(creds);
  return uploadFromBuffer(
    buffer,
    `${CLOUDINARY_FOLDER}/${jobId}`,
    'final',
    'video'
  );
}

export async function uploadThumbnail(
  buffer: Buffer,
  jobId: string,
  creds: AccountCredentials
): Promise<string> {
  initCloudinary(creds);
  return uploadFromBuffer(
    buffer,
    `${CLOUDINARY_FOLDER}/${jobId}`,
    'thumbnail',
    'image'
  );
}

export async function downloadAsBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download from ${url}: ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function uploadMusicTrack(
  buffer: Buffer,
  jobId: string,
  creds: AccountCredentials
): Promise<string> {
  initCloudinary(creds);
  return uploadFromBuffer(
    buffer,
    `${CLOUDINARY_FOLDER}/${jobId}`,
    'music',
    'video'
  );
}

export async function cleanupJobArtifacts(
  jobId: string,
  creds: AccountCredentials
): Promise<void> {
  initCloudinary(creds);
  const folder = `${CLOUDINARY_FOLDER}/${jobId}`;
  
  try {
    await cloudinary.api.delete_resources_by_prefix(folder, { resource_type: 'image' });
    await cloudinary.api.delete_resources_by_prefix(folder, { resource_type: 'video' });
    await cloudinary.api.delete_resources_by_prefix(folder, { resource_type: 'raw' });
    await cloudinary.api.delete_folder(folder);
    console.log(`[Cloudinary] Successfully cleaned up artifacts for job ${jobId}`);
  } catch (error) {
    console.warn(`[Cloudinary] Failed to cleanup artifacts for job ${jobId}:`, error);
  }
}
