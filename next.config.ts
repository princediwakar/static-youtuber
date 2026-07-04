import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Next.js 16: moved from experimental.serverComponentsExternalPackages
  serverExternalPackages: [
    'sharp',
    '@napi-rs/canvas',
    'fluent-ffmpeg',
    'ffmpeg-static',
    'googleapis',
    'google-auth-library',
    'pg',
  ],
  turbopack: {
    resolveAlias: {
      'edge-tts': 'edge-tts/out/index.js',
    },
  },
};

export default nextConfig;
