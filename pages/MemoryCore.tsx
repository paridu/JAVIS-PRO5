
import React, { useEffect, useState } from 'react';
import { memoryService, FaceRecord } from '../services/memoryService';
import { DevNote, NoteType } from '../types';

type Tab = 'BIOMETRIC' | 'SYSTEM_LOGS';

const MemoryCore: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('BIOMETRIC');
  const [faceRecords, setFaceRecords] = useState<FaceRecord[]>([]);
  const [devNotes, setDevNotes] = useState<DevNote[]>([]);

  const loadMemory = () => {
    setFaceRecords(memoryService.getFaces());
    setDevNotes(memoryService.getNotes());
  };

  useEffect(() => {
    loadMemory();
    const interval = setInterval(loadMemory, 5000); // Auto refresh
    return () => clearInterval(interval);
  }, []);

  const handleClear = () => {
    if (confirm('AUTHORIZATION REQUIRED: Purge all system data?')) {
        memoryService.clearMemory();
        loadMemory();
    }
  };

  const handleTransmit = () => {
      // Create a formatted report
      const pendingNotes = devNotes.filter(n => n.status === 'PENDING');
      if (pendingNotes.length === 0) return;

      const subject = `JARVIS SYSTEM REPORT - ${new Date().toLocaleDateString()}`;
      let body = `SYSTEM DIAGNOSTIC REPORT\n------------------------\n\n`;
      
      body += `PENDING ITEMS (${pendingNotes.length}):\n\n`;
      pendingNotes.forEach(n => {
          body += `[${n.type}] ${new Date(n.timestamp).toLocaleString()}\n${n.content}\n\n`;
      });

      // Mark as transmitted locally
      memoryService.markAllAsTransmitted();
      loadMemory();

      // Open mail client
      window.location.href = `mailto:developer@starkindustries.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto pb-24 h-full flex flex-col">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 border-b border-stark-800 pb-4 gap-4">
          <div>
            <h2 className="text-stark-gold font-mono text-2xl tracking-widest font-bold">MEMORY CORE</h2>
            <p className="text-stark-500 text-xs tracking-[0.3em] mt-1">DATA STORAGE FACILITY</p>
          </div>
          
          <div className="flex gap-4">
             <button 
                onClick={handleClear}
                className="px-4 py-2 border border-red-500/50 text-red-400 text-xs font-bold tracking-widest hover:bg-red-900/20 hover:border-red-500 transition-all"
             >
               PURGE DATA
             </button>
          </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
          <button 
             onClick={() => setActiveTab('BIOMETRIC')}
             className={`px-6 py-2 text-xs font-bold tracking-widest border-b-2 transition-all ${activeTab === 'BIOMETRIC' ? 'border-stark-gold text-stark-gold' : 'border-transparent text-stark-500 hover:text-stark-400'}`}
          >
              BIOMETRIC ID
          </button>
          <button 
             onClick={() => setActiveTab('SYSTEM_LOGS')}
             className={`px-6 py-2 text-xs font-bold tracking-widest border-b-2 transition-all ${activeTab === 'SYSTEM_LOGS' ? 'border-stark-gold text-stark-gold' : 'border-transparent text-stark-500 hover:text-stark-400'}`}
          >
              DEV LOGS
          </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
          {activeTab === 'BIOMETRIC' && (
             faceRecords.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-stark-800 rounded-lg bg-stark-800/20">
                    <div className="text-stark-500 font-mono tracking-widest animate-pulse">NO BIOMETRIC DATA FOUND</div>
                </div>
             ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {faceRecords.map((record) => (
                        <div key={record.id} className="bg-stark-900/80 border border-stark-500/30 p-4 rounded-lg backdrop-blur-sm hover:border-stark-gold/50 transition-all group relative overflow-hidden">
                            <div className="flex justify-between items-start mb-2 relative z-10">
                                <span className="text-xs text-stark-500 font-mono">{new Date(record.timestamp).toLocaleString()}</span>
                                <div className="w-2 h-2 bg-stark-gold rounded-full shadow-[0_0_10px_rgba(251,191,36,0.8)]"></div>
                            </div>
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-stark-400 text-xs">ID:</span>
                                    <span className="text-white font-bold tracking-wider text-lg truncate">{record.identity}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-sm font-mono mt-3">
                                    <div className="bg-black/40 p-2 rounded border border-stark-800">
                                        <span className="block text-stark-500 text-[10px]">EST. AGE</span>
                                        <span className="text-stark-400">{record.age}</span>
                                    </div>
                                    <div className="bg-black/40 p-2 rounded border border-stark-800">
                                        <span className="block text-stark-500 text-[10px]">EXPRESSION</span>
                                        <span className="text-stark-400">{record.expression}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
             )
          )}

          {activeTab === 'SYSTEM_LOGS' && (
             <div className="space-y-4">
                 <div className="flex justify-between items-center bg-black/40 p-3 border border-stark-800 rounded mb-4">
                     <span className="text-stark-500 text-xs tracking-widest">PENDING TRANSMISSION: {devNotes.filter(n => n.status === 'PENDING').length}</span>
                     <button 
                        onClick={handleTransmit}
                        disabled={devNotes.filter(n => n.status === 'PENDING').length === 0}
                        className="px-4 py-2 bg-stark-gold/10 text-stark-gold border border-stark-gold/50 text-xs font-bold tracking-widest hover:bg-stark-gold hover:text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                     >
                        TRANSMIT REPORT
                     </button>
                 </div>

                 {devNotes.length === 0 ? (
                    <div className="h-40 flex items-center justify-center text-stark-500 font-mono tracking-widest">NO LOGS RECORDED</div>
                 ) : (
                    <div className="grid gap-3">
                        {devNotes.map((note) => (
                             <div key={note.id} className={`p-4 border-l-4 rounded bg-stark-900/50 ${note.type === 'BUG_REPORT' ? 'border-red-500' : note.type === 'FEATURE_REQUEST' ? 'border-cyan-500' : 'border-gray-500'}`}>
                                 <div className="flex justify-between mb-2">
                                     <span className={`text-xs font-bold tracking-widest ${note.type === 'BUG_REPORT' ? 'text-red-400' : note.type === 'FEATURE_REQUEST' ? 'text-cyan-400' : 'text-gray-400'}`}>
                                         {note.type}
                                     </span>
                                     <div className="flex items-center gap-2">
                                         <span className="text-xs text-stark-600">{new Date(note.timestamp).toLocaleString()}</span>
                                         {note.status === 'TRANSMITTED' && <span className="text-[10px] bg-green-900 text-green-400 px-1 rounded">SENT</span>}
                                     </div>
                                 </div>
                                 <p className="text-stark-300 font-mono text-sm">{note.content}</p>
                             </div>
                        ))}
                    </div>
                 )}
             </div>
          )}
      </div>
    </div>
  );
};

export default MemoryCore;
