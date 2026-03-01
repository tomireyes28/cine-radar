import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans"; 
import "./globals.css";
import Navbar from "@/components/ui/Navbar";

export const metadata: Metadata = {
  title: 'Cine Radar | Tu cartelera actualizada',
  description: 'Encontrá los mejores horarios, cines y estrenos en un solo lugar.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark"> 
      <body className={`${GeistSans.className} bg-background text-foreground antialiased`}>
        <Navbar /> 
        <main className="pt-20 pb-24 md:pb-10 min-h-screen"> 
          {children}
        </main>
      </body>
    </html>
  );
}