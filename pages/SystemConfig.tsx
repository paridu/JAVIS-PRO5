import React from 'react';

const SystemConfig: React.FC = () => {
  const browserInfo = navigator.userAgent;
  const platform = navigator.platform;
  const cores = navigator.hardwareConcurrency || 'UNKNOWN';

  const handleReload = () => {
      window.location.reload();
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
       <h2 className="text-stark-gold font-mono text-2xl tracking-widest font-bold mb-8 border-b border-stark-800 pb-4">SYSTEM CONFIGURATION</h2>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Diagnostics Column */}
           <div className="space-y-6">
               <div className="bg-stark-900 border border-stark-500/30 p-6 rounded-lg relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-2 opacity-20">
                       <svg className="w-16 h-16 text-stark-500" fill="currentColor" viewBox="0 0 24 24"><path d="M2 12h2a8 8 0 1 1 8 8v2a10 10 0 1 0-10-10z"/></svg>
                   </div>
                   <h3 className="text-cyan-400 font-mono font-bold tracking-widest mb-4">DIAGNOSTICS</h3>
                   
                   <ul className="space-y-3 text-xs font-mono text-stark-400">
                       <li className="flex justify-between border-b border-stark-800 pb-1">
                           <span>KERNEL VERSION</span>
                           <span className="text-white">REV. 2.5.0 (GEMINI)</span>
                       </li>
                       <li className="flex justify-between border-b border-stark-800 pb-1">
                           <span>CPU CORES</span>
                           <span className="text-white">{cores} LOGICAL</span>
                       </li>
                       <li className="flex justify-between border-b border-stark-800 pb-1">
                           <span>PLATFORM</span>
                           <span className="text-white uppercase">{platform}</span>
                       </li>
                       <li className="flex justify-between border-b border-stark-800 pb-1">
                           <span>STATUS</span>
                           <span className="text-green-400 animate-pulse">ONLINE</span>
                       </li>
                   </ul>
               </div>

               <div className="p-4 bg-yellow-900/10 border border-yellow-600/30 rounded text-xs font-mono text-yellow-500">
                   WARNING: Unauthorized access to Stark Industries mainframe is a federal offense. This terminal is monitored.
               </div>
           </div>

           {/* Controls Column */}
           <div className="space-y-4">
               <h3 className="text-stark-500 font-mono text-sm tracking-widest">MAINTENANCE PROTOCOLS</h3>
               
               <button 
                  onClick={handleReload}
                  className="w-full py-4 border border-stark-500 text-stark-500 font-bold tracking-[0.2em] hover:bg-stark-500 hover:text-black transition-all group"
               >
                   <span className="group-hover:hidden">REBOOT SYSTEM</span>
                   <span className="hidden group-hover:inline">CONFIRM REBOOT</span>
               </button>

               <button 
                  onClick={() => window.open('https://ai.google.dev', '_blank')}
                  className="w-full py-4 border border-stark-800 text-stark-500 font-bold tracking-[0.2em] hover:border-stark-gold hover:text-stark-gold transition-all"
               >
                   VIEW DOCUMENTATION
               </button>

               <div className="mt-8 pt-8 border-t border-stark-800 text-center">
                   <p className="text-[10px] text-stark-800 tracking-widest">
                       STARK INDUSTRIES PROPRIETARY ALGORITHM<br/>
                       COPYRIGHT © 2025
                   </p>
               </div>
           </div>
       </div>
    </div>
  );
};

export default SystemConfig;