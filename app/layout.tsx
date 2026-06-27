// Path: app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Slideshow — Dashboard',
  description:
    'Automated pipeline dashboard for generating and uploading AI-powered YouTube Shorts across multiple channels via Inngest and Gemini.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
