
import React from 'react';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '../constants';

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navItems = [
    { name: 'ASSISTANT', path: ROUTES.HOME },
    { name: 'IOT CONFIG', path: ROUTES.IOT_CONFIG },
    { name: 'LOGS', path: ROUTES.CHAT },
    { name: 'MEMORY', path: ROUTES.MEMORY },
    { name: 'SYS', path: ROUTES.SETTINGS },
  ];

  return (
    <div className="min-h-screen bg-stark-900 text-stark-500 font-mono relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 scanline z-50 pointer-events-none opacity-30"></div>
      
      <header className="h-14 border-b border-stark-800 flex items-center justify-between px-6 z-40 bg-stark-900/90 backdrop-blur-md">
        <div className="flex items-center gap-2">
           <div className="w-3 h-3 bg-stark-gold rounded-full animate-pulse"></div>
           <span className="text-stark-gold font-bold tracking-widest text-sm">J.A.R.V.I.S <span className="text-xs opacity-50">EDGE.IOT</span></span>
        </div>
        <div className="hidden md:flex gap-4 text-xs tracking-widest opacity-60">
            <span>EDGE: ACTIVE</span>
            <span>HUB: 192.168.1.1</span>
            <span>NODES: 4</span>
        </div>
      </header>

      <main className="flex-1 relative z-30 overflow-y-auto">
        {children}
      </main>

      <footer className="h-16 border-t border-stark-800 flex items-center justify-center z-40 bg-stark-900/90 backdrop-blur-md">
        <nav className="flex gap-1 md:gap-4 lg:gap-8 overflow-x-auto no-scrollbar px-4">
          {navItems.map((item) => (
            <NavLink 
              key={item.name} 
              to={item.path}
              className={({ isActive }) => `
                px-3 py-2 text-[10px] font-bold tracking-[0.2em] border border-transparent transition-all duration-300 whitespace-nowrap
                ${isActive 
                  ? 'text-stark-gold border-stark-gold/30 bg-stark-gold/5 shadow-[0_0_15px_rgba(251,191,36,0.1)]' 
                  : 'text-gray-500 hover:text-stark-400'}
              `}
            >
              {item.name}
            </NavLink>
          ))}
        </nav>
      </footer>
    </div>
  );
};

export default Layout;
