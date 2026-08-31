import type {Metadata, Viewport} from 'next';
import { Manrope, Playfair_Display } from 'next/font/google';
import { Toaster } from "@/components/ui/toaster";
import './globals.css';
import './lighthouse-landing.css';

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-headline',
});

export const metadata: Metadata = {
  title: 'Lighthouse Lodge | Management Suite',
  description: 'Lighthouse Lodge — smart hotel management, bookings, and operations.',
  icons: {
    icon: '/logo.jpeg',
    shortcut: '/logo.jpeg',
    apple: [{ url: '/logo.jpeg', sizes: 'any', type: 'image/jpeg' }],
  },
  appleWebApp: {
    capable: true,
    title: 'Lighthouse Lodge',
    statusBarStyle: 'black-translucent',
  },
  manifest: '/manifest.webmanifest',
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'application-name': 'Lighthouse Lodge',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1d110a',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${playfair.variable} font-body antialiased bg-background`} suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
