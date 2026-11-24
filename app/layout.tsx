import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'PadLab — web sampler', description: 'Clip audio & video into pads, play, record scenes.' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, themeColor: '#09090b', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
