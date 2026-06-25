import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next.js 16: moved from experimental.serverComponentsExternalPackages
  serverExternalPackages: [
    'sharp',
    '@napi-rs/canvas',
    'fluent-ffmpeg',
    '@ffprobe-installer/ffprobe',
    'ffmpeg-static',
    'googleapis',
    'google-auth-library',
    'pg',
  ],
  // Use empty turbopack config to keep Turbopack happy
  turbopack: {},
};

export default nextConfig;
