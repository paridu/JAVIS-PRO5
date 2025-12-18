
import React, { useState } from 'react';

interface HardwareProfile {
  id: string;
  name: string;
  ip: string;
  port: number;
  protocol: 'WEBSOCKET' | 'MQTT' | 'HTTP';
  type: 'ESP32' | 'ARDUINO' | 'OTHER';
}

const IotConfig: React.FC = () => {
  const [profiles, setProfiles] = useState<HardwareProfile[]>([
    { id: '1', name: 'Living Room ESP', ip: '192.168.1.45', port: 81, protocol: 'WEBSOCKET', type: 'ESP32' },
    { id: '2', name: 'Arduino Sensor Hub', ip: '192.168.1.46', port: 1883, protocol: 'MQTT', type: 'ARDUINO' }
  ]);

  const [isAdding, setIsAdding] = useState(false);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto pb-24 h-full">
      <div className="border-b border-stark-800 pb-4 mb-8">
        <h2 className="text-stark-gold font-mono text-2xl tracking-widest font-bold uppercase">Hardware Interface</h2>
        <p className="text-stark-500 text-[10px] tracking-[0.4em] mt-2">MCU & SENSOR NODE CONFIGURATION</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Device List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs text-stark-400 font-bold tracking-widest uppercase">Detected Nodes</span>
            <button 
              onClick={() => setIsAdding(true)}
              className="text-[10px] px-3 py-1 bg-cyan-500/10 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500 hover:text-black transition-all"
            >
              + ADD NODE
            </button>
          </div>

          {profiles.map(p => (
            <div key={p.id} className="bg-black/40 border border-stark-800 p-4 rounded-lg flex items-center justify-between group hover:border-stark-gold/30 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 flex items-center justify-center rounded bg-stark-900 border border-stark-800 ${p.type === 'ESP32' ? 'text-blue-400' : 'text-green-400'}`}>
                  <span className="text-[10px] font-bold">{p.type === 'ESP32' ? 'ESP' : 'AVR'}</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-stark-300 uppercase">{p.name}</h4>
                  <p className="text-[9px] text-stark-600 font-mono tracking-tighter">{p.protocol} // {p.ip}:{p.port}</p>
                </div>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[8px] px-1 bg-green-900/30 text-green-500 border border-green-500/20 mb-1">CONNECTED</span>
                <button className="text-[9px] text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">REMOVE</button>
              </div>
            </div>
          ))}
        </div>

        {/* Global Connection Settings */}
        <div className="space-y-6">
          <div className="bg-stark-900 border border-stark-800 p-6 rounded-lg">
            <h3 className="text-stark-gold text-xs font-bold tracking-widest mb-6 border-b border-stark-800 pb-2">EDGE PROTOCOL SETTINGS</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-[9px] text-stark-500 block mb-1">MQTT BROKER URI</label>
                <input type="text" placeholder="mqtt://broker.local" className="w-full bg-black border border-stark-800 p-2 text-xs text-stark-300 focus:border-stark-gold outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] text-stark-500 block mb-1">PORT</label>
                  <input type="number" placeholder="1883" className="w-full bg-black border border-stark-800 p-2 text-xs text-stark-300 focus:border-stark-gold outline-none" />
                </div>
                <div>
                  <label className="text-[9px] text-stark-500 block mb-1">BAUD RATE (SERIAL)</label>
                  <select className="w-full bg-black border border-stark-800 p-2 text-xs text-stark-300 focus:border-stark-gold outline-none">
                    <option>9600</option>
                    <option>115200</option>
                  </select>
                </div>
              </div>
              <button className="w-full py-3 bg-stark-gold/10 border border-stark-gold/30 text-stark-gold text-[10px] font-bold tracking-[0.2em] hover:bg-stark-gold hover:text-black transition-all">
                UPDATE EDGE HUB
              </button>
            </div>
          </div>

          <div className="p-4 bg-blue-900/10 border border-blue-500/20 rounded-lg">
            <p className="text-[10px] text-blue-400 font-mono leading-relaxed">
              MCU nodes are scanned automatically via MDNS. Ensure your ESP32/Arduino code implements the Stark Edge Protocol v1.4 for proper recognition.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IotConfig;
