// Path: app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Slideshow — History Shorts Dashboard',
  description:
    'Automated pipeline dashboard for generating and uploading history-niche YouTube Shorts via Inngest, Gemini, and DeepSeek.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
