import React from 'react';

const ChatLog: React.FC = () => {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h2 className="text-stark-gold font-mono text-xl tracking-widest mb-6 border-b border-stark-800 pb-2">COMMUNICATION LOGS</h2>
      <div className="space-y-4 font-mono text-sm opacity-70">
        <div className="p-4 border-l-2 border-stark-500 bg-stark-800/30">
            <span className="text-xs text-stark-500 block mb-1">SYSTEM - 10:42:01</span>
            <p>Core systems initialized. Audio driver active. Neural connection established.</p>
        </div>
        <div className="p-4 border-l-2 border-stark-gold bg-stark-gold/5">
             <span className="text-xs text-stark-gold block mb-1">JARVIS - 10:42:05</span>
             <p>Welcome back, sir. I have calibrated the interface for optimal performance.</p>
        </div>
        <div className="text-center py-10 text-gray-700">
            [ END OF ENCRYPTED STREAM ]
        </div>
      </div>
    </div>
  );
};

export default ChatLog;
