import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Modulo:Alive',
  description:
    'A top-down 2D survival and settlement management game. Eight survivors, one forest, and everything they need to build.',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Modulo:Alive' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#1b2317',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
