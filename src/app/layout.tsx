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

const publicSiteUrl = 'https://www.lighthousemoshi.com';
const googleSiteVerification = (
  process.env.GOOGLE_SITE_VERIFICATION
  ?? process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
)?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(publicSiteUrl),
  alternates: {
    canonical: '/',
  },
  verification: googleSiteVerification
    ? { google: googleSiteVerification }
    : undefined,
  title: 'Lighthouse Lodge | Management Suite',
  description: 'Lighthouse Lodge — smart hotel management, bookings, and operations.',
  icons: {
    icon: [{ url: '/logo-192.jpg', sizes: '192x192', type: 'image/jpeg' }],
    shortcut: '/logo-192.jpg',
    apple: [{ url: '/logo-192.jpg', sizes: '192x192', type: 'image/jpeg' }],
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
