import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import './globals.css';
import Navbar from '@/components/ui/Navbar';

export const metadata: Metadata = {
  title: {
    default: 'Cine Radar | Cartelera y Horarios de Cine en Argentina',
    template: '%s | Cine Radar',
  },
  description:
    'Cartelera unificada de cine en Argentina. Consultá horarios, formatos (2D, 3D, 4D, IMAX, XD, D-BOX) y complejos de Cinemark Hoyts, Cinépolis, Showcase, Cinema Center, Atlas Cines y Multiplex en un solo lugar.',
  keywords: [
    'cine argentina',
    'cartelera cine',
    'horarios cine argentina',
    'cinemark hoyts',
    'cinepolis argentina',
    'todoshowcase',
    'cinema center',
    'atlas cines',
    'multiplex cines',
    'estrenos cine',
  ],
  authors: [{ name: 'Cine Radar' }],
  creator: 'Cine Radar',
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://cinema-agenda-app.vercel.app',
  ),
  openGraph: {
    title: 'Cine Radar | Cartelera Unificada de Cines en Argentina',
    description:
      'Encontrá todas las películas, horarios, formatos y salas de cine de Argentina en una sola plataforma.',
    siteName: 'Cine Radar',
    locale: 'es_AR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cine Radar | Cartelera de Cine en Argentina',
    description:
      'Todos los cines, horarios y formatos de Argentina en un solo lugar.',
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${GeistSans.className} bg-background text-foreground antialiased`}
      >
        <Navbar />
        <main className="pt-20 pb-24 md:pb-10 min-h-screen">{children}</main>
      </body>
    </html>
  );
}
