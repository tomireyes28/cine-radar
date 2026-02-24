import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans"; // Tipografía moderna automática de Vercel
import "./globals.css";
import Navbar from "@/components/ui/Navbar";

export const metadata: Metadata = {
  title: "Cinema Aggregator",
  description: "Todos los cines, un solo lugar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark"> {/* Forzamos clase dark */}
      <body className={`${GeistSans.className} bg-background text-foreground antialiased`}>
        <Navbar /> {/* <--- La Navbar va aquí */}
        <main className="pt-20 pb-24 md:pb-10 min-h-screen"> 
          {/* Padding Top para que no la tape el header desktop, Padding Bottom para el mobile */}
          {children}
        </main>
      </body>
    </html>
  );
}