import React, { useState, useEffect, useRef } from 'react';
import JarvisFace from '../components/JarvisFace';
import { liveService } from '../services/liveService';
import { geminiService } from '../services/geminiService';
import { memoryService } from '../services/memoryService'; 
import { iotService } from '../services/iotService';
import { AgentState, IntentionState, ToolCallData, NoteType, IotDevice } from '../types';
import { JARVIS_PERSONA } from '../constants';

const Assistant: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [state, setState] = useState<AgentState>(AgentState.IDLE);
  const [intention, setIntention] = useState<IntentionState>(IntentionState.IDLE);
  const [lastTranscript, setLastTranscript] = useState<string>("SYSTEM INITIALIZING...");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [roboticsData, setRoboticsData] = useState<any>(null);
  const [agentReport, setAgentReport] = useState<string | null>(null);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [iotDevices, setIotDevices] = useState<IotDevice[]>([]);
  const [showControls, setShowControls] = useState(false);
  const [isMirrored, setIsMirrored] = useState(true);

  // Music Player State (InnerTune Inspired)
  const [youtubeQuery, setYoutubeQuery] = useState<string | null>(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  const stateRef = useRef(state);
  const isInitializedRef = useRef(isInitialized);
  const isExplicitShutdownRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const facingModeRef = useRef<'user' | 'environment'>('user'); 

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { isInitializedRef.current = isInitialized; }, [isInitialized]);

  useEffect(() => {
    setIotDevices(iotService.getDevices());
  }, []);

  useEffect(() => {
    if (state === AgentState.AGENT_PROCESSING) setActiveFeature("LIGHTNING AGENT");
    else if (state === AgentState.THINKING) setActiveFeature("NEURAL PROCESSING");
    else if (youtubeQuery) setActiveFeature("MEDIA STREAMING");
    else if (roboticsData) setActiveFeature("ENVIRONMENTAL SENSORS");
    else if (state === AgentState.ERROR) setActiveFeature("SYSTEM ERROR");
    else setActiveFeature(null);
  }, [state, youtubeQuery, roboticsData]);

  useEffect(() => {
    handleSystemStart();
    const resumeAudio = () => { liveService.resumeAudio(); };
    window.addEventListener('click', resumeAudio);
    window.addEventListener('touchstart', resumeAudio);
    return () => {
        window.removeEventListener('click', resumeAudio);
        window.removeEventListener('touchstart', resumeAudio);
        stopVideo();
        liveService.disconnect();
    };
  }, []);

  const getCurrentFrame = (): string | null => {
      if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return null;
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
          ctx.drawImage(videoRef.current, 0, 0);
          return canvasRef.current.toDataURL('image/jpeg', 0.8);
      }
      return null;
  };

  const startVideo = async () => {
    try {
      const mode = facingModeRef.current;
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } } });
      } catch (e) {
         try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
         } catch (e2) {
             stream = await navigator.mediaDevices.getUserMedia({ video: true });
         }
      }
      if (!stream) throw new Error("Could not acquire video stream");
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
        setIsVideoActive(true);
        setIsMirrored(mode === 'user');
        if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = window.setInterval(() => { captureAndSendFrame(); }, 1000); 
      }
    } catch (e: any) {
      setIsVideoActive(false);
    }
  };

  const stopVideo = () => {
    if (videoIntervalRef.current) { clearInterval(videoIntervalRef.current); videoIntervalRef.current = null; }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsVideoActive(false);
  };

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current || videoRef.current.readyState < 2) return; 
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
       canvasRef.current.width = videoRef.current.videoWidth;
       canvasRef.current.height = videoRef.current.videoHeight;
       ctx.drawImage(videoRef.current, 0, 0);
       const base64 = canvasRef.current.toDataURL('image/jpeg', 0.6).split(',')[1];
       liveService.sendVideoFrame(base64);
    }
  };

  const handleCameraSwitch = async () => {
      stopVideo();
      facingModeRef.current = facingModeRef.current === 'user' ? 'environment' : 'user';
      await startVideo();
  };

  useEffect(() => {
    liveService.onStateChange = (isActive) => {
      if (!isActive) {
          if (isInitializedRef.current && !isExplicitShutdownRef.current) {
              setState(AgentState.CONNECTING);
              setTimeout(() => { handleSystemStart(); }, 2000);
          } else {
              setState(AgentState.IDLE);
          }
      }
    };

    liveService.onError = (error) => {
        setLastTranscript(`ERROR: ${error.message || "Unknown Failure"}`);
        setState(AgentState.ERROR);
    };

    liveService.onTranscript = (text, type) => {
      setLastTranscript(type === 'user' ? `USER: ${text}` : `JARVIS: ${text}`);
      if (type === 'model') {
        setState(AgentState.SPEAKING);
        setTimeout(() => { if (stateRef.current === AgentState.SPEAKING) setState(AgentState.IDLE); }, 3000);
      }
    };

    liveService.onVolumeChange = (vol) => {
       if (vol > 10 && ![AgentState.SPEAKING, AgentState.THINKING, AgentState.ERROR, AgentState.AGENT_PROCESSING].includes(stateRef.current)) {
           setState(AgentState.LISTENING);
       } else if (vol <= 10 && stateRef.current === AgentState.LISTENING) {
           setState(AgentState.IDLE);
       }
    };

    liveService.onToolCall = async (tool: ToolCallData) => {
      setLastTranscript(`PROTOCOL: ${tool.name.toUpperCase()}`);
      try {
          switch (tool.name) {
              case 'play_youtube': {
                  setYoutubeQuery(tool.args.query);
                  setIsMusicPlaying(true);
                  return { result: `Streaming protocol initiated for: ${tool.args.query}` };
              }
              case 'iot_command': {
                  setIntention(IntentionState.INTERVENE);
                  const result = iotService.command(tool.args.device, tool.args.value);
                  setIotDevices(iotService.getDevices());
                  setTimeout(() => setIntention(IntentionState.MONITOR), 2000);
                  return result ? { result: `Success: ${tool.args.device} set to ${tool.args.value}` } : { error: "Device not found" };
              }
              case 'get_iot_status': {
                  return { result: iotService.getStatusSummary() };
              }
              case 'switch_camera':
                  await handleCameraSwitch();
                  return { result: "Camera switched" };
              case 'robotics_scan': {
                  setIntention(IntentionState.OPTIMIZE);
                  const frame = getCurrentFrame();
                  if (!frame) return { error: "No visual feed" };
                  const json = await geminiService.roboticsScan(frame);
                  setRoboticsData(json);
                  return { result: "Scan complete", data: json };
              }
              default:
                  return { result: "Executed" };
          }
      } catch (e: any) {
          setState(AgentState.IDLE);
          return { error: `Failed: ${e.message}` };
      }
    };
  }, []); 

  const handleSystemStart = async () => {
    isExplicitShutdownRef.current = false;
    setLastTranscript("LINKING TO IOT HUB...");
    try {
        setState(AgentState.CONNECTING);
        await liveService.connect();
        setIsInitialized(true);
        if (!isVideoActive) await startVideo();
        setState(AgentState.IDLE);
        setIntention(IntentionState.MONITOR);
        liveService.playGreeting("สวัสดีครับ ผมจาร์วิส ระบบ Edge AI พร้อมเชื่อมต่อมัลติมีเดียและ IoT แล้วครับ");
    } catch (e: any) {
        setState(AgentState.ERROR);
    }
  };

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Visual Feed */}
      <div className={`fixed inset-0 z-0 transition-opacity duration-1000 ${isVideoActive ? 'opacity-40' : 'opacity-0'}`}>
        <video ref={videoRef} className={`w-full h-full object-cover ${isMirrored ? 'transform scale-x-[-1]' : ''}`} muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent"></div>
      </div>

      {/* Active Feature HUD (Top Overlay) */}
      {activeFeature && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-auto">
              <div className="flex flex-col items-center animate-pulse-fast">
                  <div className="px-4 py-1.5 bg-green-500/10 border border-green-500 backdrop-blur-md rounded-full flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span className="text-green-500 font-mono text-[10px] font-bold tracking-widest uppercase">{activeFeature} ACTIVE</span>
                  </div>
              </div>
          </div>
      )}

      {/* Music Player HUD (InnerTune Inspired) */}
      {youtubeQuery && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-[70] w-[90vw] max-w-md pointer-events-auto">
            <div className="bg-black/80 backdrop-blur-2xl border border-stark-gold/30 rounded-3xl p-6 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden relative">
                <button 
                    onClick={() => setYoutubeQuery(null)}
                    className="absolute top-4 right-4 text-stark-600 hover:text-white transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                
                <div className="flex items-center gap-6">
                    <div className="w-24 h-24 bg-gradient-to-tr from-stark-gold/20 to-cyan-500/20 rounded-2xl flex items-center justify-center border border-white/10 relative overflow-hidden group">
                        <div className="absolute inset-0 bg-stark-gold/5 animate-pulse"></div>
                        <svg className="w-12 h-12 text-stark-gold relative z-10" fill="currentColor" viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-white font-bold text-lg truncate uppercase tracking-tight">{youtubeQuery}</h4>
                        <p className="text-stark-500 text-xs font-mono uppercase tracking-widest mt-1">Stark Media Stream</p>
                    </div>
                </div>

                <div className="mt-6 space-y-4">
                    {/* Progress Bar */}
                    <div className="relative h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="absolute h-full bg-stark-gold animate-[progress_30s_linear_infinite]" style={{ width: '0%' }}></div>
                    </div>
                    
                    <div className="flex justify-between text-[10px] text-stark-600 font-mono">
                        <span>0:42</span>
                        <span>3:15</span>
                    </div>

                    <div className="flex items-center justify-center gap-10">
                        <button className="text-white/60 hover:text-white transition-colors"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
                        <button 
                            onClick={() => setIsMusicPlaying(!isMusicPlaying)}
                            className="w-14 h-14 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                        >
                            {isMusicPlaying ? (
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                            ) : (
                                <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                            )}
                        </button>
                        <button className="text-white/60 hover:text-white transition-colors"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
                    </div>
                </div>

                {/* Hidden YouTube Search Embed Link (Simulated for compliance) */}
                <iframe 
                    className="hidden" 
                    src={`https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(youtubeQuery)}&autoplay=1`}
                    title="YouTube music player"
                ></iframe>
            </div>
        </div>
      )}

      {/* Main UI Layer */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 pointer-events-none mb-32">
        <div className="w-[85vw] max-w-[400px] aspect-square relative pointer-events-auto">
             <JarvisFace state={state} tone={JARVIS_PERSONA.tone} />
             <div className={`absolute inset-0 rounded-full border-2 transition-all duration-1000 opacity-20 scale-110
                 ${intention === IntentionState.INTERVENE ? 'border-red-500 animate-ping' : 
                   intention === IntentionState.ALERT ? 'border-orange-500' : 
                   intention === IntentionState.MONITOR ? 'border-cyan-500' : 'border-stark-gold'}`}></div>
        </div>

        <div className="mt-6 text-center px-6 max-w-3xl min-h-[60px] pointer-events-auto">
           <p className={`font-mono text-sm md:text-lg tracking-[0.2em] transition-colors duration-300 uppercase ${
               state === AgentState.SPEAKING ? 'text-stark-gold font-bold' : 'text-stark-500/60'
           }`}>
             {lastTranscript}
           </p>
        </div>
      </div>

      {/* Optimized Mobile Control Panel */}
      <div className="fixed bottom-20 md:bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
          <div className={`flex flex-wrap justify-center gap-2 p-3 bg-black/80 backdrop-blur-xl border border-stark-800 rounded-2xl shadow-2xl transition-all duration-500 origin-bottom pointer-events-auto ${showControls ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none h-0 p-0 overflow-hidden'}`}>
              <button onClick={handleCameraSwitch} className="px-3 py-1.5 bg-stark-900 border border-cyan-500/30 text-cyan-400 text-[9px] font-bold tracking-widest uppercase rounded">Switch Cam</button>
              <button onClick={() => { setYoutubeQuery(null); setRoboticsData(null); }} className="px-3 py-1.5 bg-stark-900 border border-stark-gold/30 text-stark-gold text-[9px] font-bold tracking-widest uppercase rounded">Reset HUD</button>
              <button onClick={() => { liveService.disconnect(); setIsInitialized(false); }} className="px-3 py-1.5 bg-red-950/20 border border-red-500/30 text-red-500 text-[9px] font-bold tracking-widest uppercase rounded">Shutdown</button>
          </div>

          <div className="flex items-center gap-3 pointer-events-auto">
             {!isInitialized ? (
                <button onClick={handleSystemStart} className="px-8 py-2.5 bg-stark-gold text-black text-xs font-bold tracking-[0.3em] rounded-full shadow-[0_0_20px_rgba(251,191,36,0.4)] animate-pulse uppercase">Establish Link</button>
             ) : (
                <>
                  <button onClick={() => setShowControls(!showControls)} className={`w-10 h-10 flex items-center justify-center rounded-full border transition-all ${showControls ? 'bg-stark-gold border-stark-gold text-black' : 'bg-black/40 border-stark-800 text-stark-500'}`}>
                      <svg className={`w-5 h-5 transition-transform duration-300 ${showControls ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" /></svg>
                  </button>
                  <div className="w-10 h-10 flex items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/40 text-cyan-400 animate-pulse">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                </>
             )}
          </div>
      </div>

      <style>{`
        @keyframes progress {
            from { width: 0%; }
            to { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default Assistant;