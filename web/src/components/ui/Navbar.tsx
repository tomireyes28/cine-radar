'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
// ✅ Cambiamos los íconos importados
import { Home, MapPin, CalendarDays } from 'lucide-react'; 
import { clsx } from 'clsx';

// ✅ Menú actualizado y limpio
const navItems = [
  { name: 'Inicio', href: '/', icon: Home },
  { name: 'Cines', href: '/theaters', icon: MapPin },
  { name: 'Próximamente', href: '/proximamente', icon: CalendarDays },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <>
      {/* --- DESKTOP NAVBAR (Top) --- */}
      <header className="hidden md:flex fixed top-0 w-full z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo Animado */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl font-bold bg-linear-to-r from-violet-500 to-fuchsia-500 bg-clip-text text-transparent"
          >
            CinemaApp
          </motion.div>

          {/* Menú Clásico Desktop */}
          <nav className="flex gap-8">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  key={item.href} 
                  href={item.href}
                  className={clsx(
                    "text-sm font-medium transition-colors hover:text-violet-400 relative py-2",
                    isActive ? "text-violet-400" : "text-zinc-400"
                  )}
                >
                  {item.name}
                  {/* Línea animada debajo del link activo */}
                  {isActive && (
                    <motion.div
                      layoutId="desktop-navbar-underline"
                      className="absolute left-0 right-0 bottom-0 h-0.5 bg-violet-500"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* --- MOBILE NAVBAR (Bottom) --- */}
      <nav className="md:hidden fixed bottom-0 w-full z-50 bg-zinc-950/90 backdrop-blur-lg border-t border-zinc-800 pb-safe">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link 
                key={item.href} 
                href={item.href}
                className="relative flex flex-col items-center justify-center w-full h-full"
              >
                {/* Fondo animado al seleccionar */}
                {isActive && (
                  <motion.div
                    layoutId="mobile-navbar-glow"
                    className="absolute inset-2 bg-violet-500/20 rounded-xl -z-10"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                <Icon 
                  size={24} 
                  className={clsx(
                    "transition-colors duration-300",
                    isActive ? "text-violet-400" : "text-zinc-500"
                  )} 
                />
                <span className={clsx(
                  "text-[10px] mt-1 font-medium",
                  isActive ? "text-violet-300" : "text-zinc-600"
                )}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}