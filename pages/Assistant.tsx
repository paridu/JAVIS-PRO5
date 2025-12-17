
import React, { useState, useEffect, useRef } from 'react';
import JarvisFace from '../components/JarvisFace';
import { liveService } from '../services/liveService';
import { geminiService } from '../services/geminiService';
import { memoryService } from '../services/memoryService'; // Import Memory Service
import { AgentState, ToolCallData, NoteType } from '../types';

const Assistant: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [state, setState] = useState<AgentState>(AgentState.IDLE);
  const [lastTranscript, setLastTranscript] = useState<string>("SYSTEM STANDBY");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [roboticsData, setRoboticsData] = useState<any>(null);
  const [agentReport, setAgentReport] = useState<string | null>(null);
  const [faceData, setFaceData] = useState<any>(null);
  const [isFaceLocked, setIsFaceLocked] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [liveVolume, setLiveVolume] = useState(0);
  const [isMirrored, setIsMirrored] = useState(true); 
  const [showControls, setShowControls] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);

  // Refs for tracking state inside callbacks without triggering effects
  const stateRef = useRef(state);
  const isInitializedRef = useRef(isInitialized);

  // Hardware Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const facingModeRef = useRef<'user' | 'environment'>('user'); 

  // Sync refs with state
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { isInitializedRef.current = isInitialized; }, [isInitialized]);

  // Determine Active Feature Label for HUD
  useEffect(() => {
    if (state === AgentState.AGENT_PROCESSING) setActiveFeature("LIGHTNING AGENT");
    else if (state === AgentState.THINKING) setActiveFeature("NEURAL PROCESSING");
    else if (isFaceLocked) setActiveFeature("BIOMETRIC TRACKING");
    else if (generatedImage) setActiveFeature("VISUAL SYNTHESIS");
    else if (roboticsData) setActiveFeature("ENVIRONMENTAL SENSORS");
    else if (state === AgentState.ERROR) setActiveFeature("SYSTEM ERROR");
    else setActiveFeature(null);
  }, [state, isFaceLocked, generatedImage, roboticsData]);

  // --- Helper to grab current frame ---
  const getCurrentFrame = (): string | null => {
      if (!videoRef.current || !canvasRef.current) return null;
      if (videoRef.current.readyState < 2) return null;
      
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
          canvasRef.current.width = videoRef.current.videoWidth;
          canvasRef.current.height = videoRef.current.videoHeight;
          ctx.drawImage(videoRef.current, 0, 0);
          return canvasRef.current.toDataURL('image/jpeg', 0.8);
      }
      return null;
  };

  // --- Video Handling ---
  const startVideo = async () => {
    try {
      const mode = facingModeRef.current;
      console.log("Starting video with mode:", mode);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
              facingMode: mode,
              width: { ideal: 1280 },
              height: { ideal: 720 }
          } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.log("Video playback handled:", e.message));
        
        setIsVideoActive(true);
        setIsMirrored(mode === 'user');
        
        if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = window.setInterval(() => {
          captureAndSendFrame();
        }, 1000); 
      }
    } catch (e: any) {
      console.error("Camera Error", e);
      let msg = "VISUAL SENSORS OFFLINE";
      if (e.name === 'NotAllowedError') msg = "VISUAL ACCESS DENIED";
      setLastTranscript(msg);
      setIsVideoActive(false);
    }
  };

  const stopVideo = () => {
    if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsVideoActive(false);
  };

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (videoRef.current.readyState < 2) return; 

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
      setLastTranscript("SWITCHING OPTICAL SENSORS...");
      stopVideo();
      facingModeRef.current = facingModeRef.current === 'user' ? 'environment' : 'user';
      await startVideo();
  };

  useEffect(() => {
    // Setup Live Service Handlers (Run once on mount)
    liveService.onStateChange = (isActive) => {
      if (!isActive && isInitializedRef.current) {
          if (stateRef.current !== AgentState.IDLE) {
              setState(AgentState.ERROR);
              setLastTranscript("CONNECTION LOST");
          } else {
              setState(AgentState.IDLE);
          }
      }
    };

    liveService.onError = (error) => {
        setLastTranscript(`ERROR: ${error.message}`);
        setState(AgentState.ERROR);
        setTimeout(() => {
            if (stateRef.current === AgentState.ERROR) {
                setState(AgentState.IDLE);
                setLastTranscript("SYSTEM STANDBY");
            }
        }, 4000);
    };

    liveService.onTranscript = (text, type) => {
      setLastTranscript(type === 'user' ? `USER: ${text}` : `JARVIS: ${text}`);
      if (type === 'model') setState(AgentState.SPEAKING);
      
      if (type === 'model') {
          setTimeout(() => {
              if (stateRef.current === AgentState.SPEAKING) {
                  setState(AgentState.IDLE);
              }
          }, 3000);
      }
    };

    liveService.onVolumeChange = (vol) => {
       setLiveVolume(vol);
       if (vol > 10 && stateRef.current !== AgentState.SPEAKING && stateRef.current !== AgentState.THINKING && stateRef.current !== AgentState.ERROR && stateRef.current !== AgentState.AGENT_PROCESSING) {
           setState(AgentState.LISTENING);
       } else if (vol <= 10 && stateRef.current === AgentState.LISTENING) {
           setState(AgentState.IDLE);
       }
    };

    // --- CENTRALIZED TOOL HANDLER (Voice & Buttons trigger this) ---
    liveService.onToolCall = async (tool: ToolCallData) => {
      setLastTranscript(`EXECUTING PROTOCOL: ${tool.name.toUpperCase()}`);
      console.log("Executing Tool:", tool);

      try {
          switch (tool.name) {
              case 'switch_camera':
                  await handleCameraSwitch();
                  return { result: "Camera switched" };

              case 'play_youtube':
                  window.open(`https://www.youtube.com/results?search_query=${tool.args.query}`, '_blank');
                  return { result: "Opened YouTube" };

              case 'generate_image': {
                  setState(AgentState.THINKING);
                  const result = await geminiService.generateImage(tool.args.prompt);
                  if (result.image) setGeneratedImage(result.image);
                  setState(AgentState.IDLE);
                  return { result: result.image ? "Image generated successfully" : "Failed to generate image" };
              }

              case 'log_developer_note': {
                  memoryService.saveNote(tool.args.content, tool.args.category as NoteType);
                  setLastTranscript(`${tool.args.category}: LOGGED TO MEMORY`);
                  return { result: "Note saved to memory core" };
              }

              case 'robotics_scan': {
                  const frame = getCurrentFrame();
                  if (!frame) return { error: "No video feed available" };
                  
                  setLastTranscript("SCANNING ENVIRONMENT...");
                  const json = await geminiService.roboticsScan(frame);
                  setRoboticsData(json);
                  return { result: "Environment scan complete", data: json };
              }

              case 'face_analysis': {
                   const frame = getCurrentFrame();
                   if (!frame) return { error: "No video feed available" };

                   setLastTranscript("ANALYZING TARGET...");
                   const json = await geminiService.analyzeFace(frame);
                   setFaceData(json);
                   memoryService.saveFace(json);
                   setIsFaceLocked(true);
                   return { result: "Face analysis complete", data: json };
              }

              case 'lightning_agent': {
                   setState(AgentState.AGENT_PROCESSING);
                   const frame = getCurrentFrame() || undefined; // Optional image
                   const report = await geminiService.runLightningAgent(tool.args.task, frame);
                   setAgentReport(report);
                   setState(AgentState.IDLE);
                   return { result: "Agent report generated" };
              }

              default:
                  return { result: "Tool executed" };
          }
      } catch (e: any) {
          console.error("Tool Error", e);
          setState(AgentState.IDLE);
          return { error: `Execution failed: ${e.message}` };
      }
    };

    return () => {
      stopVideo();
      liveService.disconnect();
    };
  }, []); 

  // --- System Controls ---
  
  const handleSystemStart = async () => {
    setLastTranscript("INITIALIZING PROTOCOLS...");
    try {
        setState(AgentState.CONNECTING);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            stream.getTracks().forEach(t => t.stop());
        } catch (e: any) {
             console.warn("Permission pre-check failed", e);
        }
        await liveService.connect();
        setIsInitialized(true);
        await startVideo();
        setState(AgentState.IDLE);
        setLastTranscript("SYSTEM ONLINE - LISTENING");
    } catch (e: any) {
        console.error("Init Error", e);
        setState(AgentState.ERROR);
        setLastTranscript(e.message || "INITIALIZATION FAILED");
        setTimeout(() => { setIsInitialized(false); setState(AgentState.IDLE); }, 3000);
    }
  };

  const handleShutdown = () => {
    liveService.disconnect();
    stopVideo();
    setIsInitialized(false);
    setState(AgentState.IDLE);
    setLastTranscript("SYSTEM OFFLINE");
    setShowControls(false);
  };

  // --- Render ---

  if (!isInitialized) {
      return (
          <div className="h-full flex flex-col items-center justify-center relative overflow-hidden text-center z-50">
               <div className="absolute inset-0 scanline opacity-20"></div>
               <button 
                  onClick={handleSystemStart}
                  className="w-64 h-64 border-4 border-stark-800 rounded-full flex items-center justify-center relative mb-8 group transition-all hover:border-stark-gold hover:shadow-[0_0_50px_rgba(251,191,36,0.3)] bg-stark-900"
               >
                  <div className="absolute inset-0 rounded-full border border-stark-500 opacity-20 animate-ping"></div>
                  <div className="absolute inset-2 rounded-full border border-dashed border-stark-500/50 animate-spin-slow"></div>
                  <div className="text-2xl font-bold text-stark-500 group-hover:text-stark-gold tracking-widest transition-colors">
                      START<br/>SYSTEM
                  </div>
               </button>
               <p className="text-stark-500 font-mono text-sm tracking-[0.2em] animate-pulse">
                  {lastTranscript === "SYSTEM STANDBY" ? "TOUCH TO INITIALIZE" : lastTranscript}
               </p>
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      
      {/* Background Video/Camera Layer */}
      <div className={`fixed inset-0 z-0 transition-opacity duration-1000 ${isVideoActive ? 'opacity-100' : 'opacity-0'}`}>
        <video 
            ref={videoRef} 
            className={`w-full h-full object-cover ${isMirrored ? 'transform scale-x-[-1]' : ''}`} 
            muted 
            playsInline 
        />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 bg-black/30"></div>
      </div>

      {/* Active Feature HUD Overlay (Green Glass Screen Effect) */}
      {activeFeature && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-auto">
              <div className="flex flex-col items-center justify-center animate-pulse-fast">
                  <div className="px-6 py-2 bg-green-900/40 border border-green-500 backdrop-blur-md rounded-full shadow-[0_0_20px_rgba(34,197,94,0.4)] flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-ping"></div>
                      <span className="text-green-400 font-mono text-xs md:text-sm font-bold tracking-[0.2em] uppercase whitespace-nowrap">
                          {activeFeature} ACTIVE
                      </span>
                  </div>
                  <div className="h-4 w-[1px] bg-green-500/50"></div>
              </div>
          </div>
      )}

      {/* Face Lock Overlay */}
      {isFaceLocked && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
              <div className={`relative w-[80vw] max-w-[500px] aspect-square transition-all duration-500 ${faceData ? 'border-green-500' : 'border-red-500'}`}>
                   <div className={`absolute top-0 left-0 w-8 h-8 md:w-12 md:h-12 border-t-[4px] md:border-t-[6px] border-l-[4px] md:border-l-[6px] ${faceData ? 'border-green-500' : 'border-red-500'}`}></div>
                   <div className={`absolute top-0 right-0 w-8 h-8 md:w-12 md:h-12 border-t-[4px] md:border-t-[6px] border-r-[4px] md:border-r-[6px] ${faceData ? 'border-green-500' : 'border-red-500'}`}></div>
                   <div className={`absolute bottom-0 left-0 w-8 h-8 md:w-12 md:h-12 border-b-[4px] md:border-b-[6px] border-l-[4px] md:border-l-[6px] ${faceData ? 'border-green-500' : 'border-red-500'}`}></div>
                   <div className={`absolute bottom-0 right-0 w-8 h-8 md:w-12 md:h-12 border-b-[4px] md:border-b-[6px] border-r-[4px] md:border-r-[6px] ${faceData ? 'border-green-500' : 'border-red-500'}`}></div>
                   
                   <div className={`absolute inset-0 flex items-center justify-center opacity-50`}>
                       <div className="w-6 h-6 bg-transparent border border-stark-gold rounded-full"></div>
                       <div className="absolute w-full h-[1px] bg-stark-gold/20"></div>
                       <div className="absolute h-full w-[1px] bg-stark-gold/20"></div>
                   </div>

                   {!faceData && (
                       <div className="absolute inset-0 border-t-4 border-red-500/50 animate-scan"></div>
                   )}
              </div>

              {faceData && (
                  <div className="absolute left-1/2 bottom-20 md:bottom-auto md:left-[calc(50%+160px)] md:top-1/2 -translate-x-1/2 md:translate-x-0 md:-translate-y-1/2 w-64 bg-black/80 border-2 border-green-500/50 p-4 text-sm font-mono text-green-400 backdrop-blur-md rounded-lg shadow-[0_0_20px_rgba(0,255,0,0.2)] z-30 pointer-events-auto">
                      <h3 className="border-b border-green-500/30 mb-2 font-bold tracking-widest text-white">TARGET LOCKED</h3>
                      <p className="mb-1">ID: <span className="text-white font-bold">{faceData.identity_guess || "UNKNOWN"}</span></p>
                      <p className="mb-1">AGE: <span className="text-white">{faceData.age_range || "N/A"}</span></p>
                      <p className="mb-1">EXP: <span className="text-white">{faceData.expression || "ANALYZING"}</span></p>
                      <div className="mt-2 text-xs text-stark-gold border-t border-green-500/30 pt-1 flex justify-between">
                          <span>RECORD SAVED</span>
                          <button onClick={() => { setFaceData(null); setIsFaceLocked(false); }} className="text-white hover:text-red-400">CLOSE [X]</button>
                      </div>
                  </div>
              )}
          </div>
      )}

      {/* Main UI Layer */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 pointer-events-none mb-32">
        <div className={`w-[90vw] max-w-[500px] aspect-square relative transition-opacity duration-500 ${isFaceLocked ? 'opacity-20' : 'opacity-100'} pointer-events-auto`}>
          {generatedImage ? (
             <div className="relative h-full w-full border-2 border-stark-gold rounded-lg overflow-hidden shadow-[0_0_50px_rgba(251,191,36,0.5)]">
               <img src={generatedImage} onClick={() => setGeneratedImage(null)} className="w-full h-full object-cover cursor-pointer" />
               <div className="absolute bottom-0 bg-black/80 w-full text-center text-xs text-stark-gold py-1">CLICK TO DISMISS</div>
             </div>
          ) : (
             <JarvisFace state={state} />
          )}
        </div>

        <div className="mt-6 text-center px-4 max-w-3xl min-h-[60px] pointer-events-auto">
           <p className={`font-mono text-base md:text-lg tracking-widest transition-colors duration-300 ${
               state === AgentState.SPEAKING ? 'text-stark-gold font-bold drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]' : 
               state === AgentState.LISTENING ? 'text-cyan-400 font-bold drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]' : 
               state === AgentState.ERROR ? 'text-red-500 font-bold animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]' :
               state === AgentState.AGENT_PROCESSING ? 'text-blue-400 font-bold animate-pulse drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]' : 'text-stark-500'
           }`}>
             {state === AgentState.LISTENING ? "DETECTING AUDIO INPUT..." : lastTranscript}
           </p>
           {/* Robotics Data Overlay */}
           {roboticsData && (
             <div className="mt-4 bg-stark-900/90 backdrop-blur border border-stark-500 p-4 text-left text-xs font-mono text-cyan-400 rounded-lg shadow-lg max-w-sm mx-auto pointer-events-auto">
                <div className="flex justify-between border-b border-cyan-500/30 pb-2 mb-2">
                    <span className="font-bold">TELEMETRY DATA</span>
                    <span className="animate-pulse">● LIVE</span>
                </div>
                <p>OBJECTS: <span className="text-white">{roboticsData.objects?.join(', ') || 'NONE'}</span></p>
                <p>HAZARDS: <span className="text-red-400">{roboticsData.hazards?.join(', ') || 'NONE'}</span></p>
                <button onClick={() => setRoboticsData(null)} className="mt-3 w-full text-center text-stark-gold hover:text-white border border-stark-gold/30 hover:bg-stark-gold/10 py-1 rounded transition-all">DISMISS</button>
             </div>
           )}

           {/* Agent Report Overlay */}
           {agentReport && (
             <div className="mt-4 bg-slate-900/95 backdrop-blur border border-blue-500 p-6 text-left text-xs font-mono text-blue-100 rounded-lg shadow-[0_0_30px_rgba(59,130,246,0.3)] max-w-lg mx-auto pointer-events-auto max-h-[40vh] overflow-y-auto">
                <div className="flex justify-between border-b border-blue-500/30 pb-2 mb-4 items-center">
                    <span className="font-bold text-blue-400 tracking-widest">LIGHTNING AGENT REPORT</span>
                    <div className="flex gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse delay-75"></div>
                    </div>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed opacity-90">
                    {agentReport}
                </div>
                <button onClick={() => setAgentReport(null)} className="mt-6 w-full text-center text-blue-400 hover:text-white border border-blue-500/30 hover:bg-blue-500/10 py-2 rounded transition-all font-bold">ACKNOWLEDGE</button>
             </div>
           )}
        </div>
      </div>

      {/* Bottom Controls Overlay */}
      <div className="fixed bottom-20 md:bottom-8 left-0 right-0 z-30 flex flex-col items-center gap-4 pointer-events-none px-4">
        
        {/* Toggle Button for Mobile - Made smaller and less intrusive */}
        <div className="pointer-events-auto md:hidden">
            <button 
                onClick={() => setShowControls(!showControls)}
                className={`w-8 h-8 rounded-full border border-stark-500/50 bg-black/60 backdrop-blur text-stark-500 flex items-center justify-center transition-all shadow-lg ${showControls ? 'bg-stark-500 text-black rotate-180' : 'hover:bg-stark-500/20'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M3 6a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3V6ZM3 15.75a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2.25Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3v-2.25Z" clipRule="evenodd" />
                </svg>
            </button>
        </div>

        {/* Status Indicators / Manual Overrides - Hidden by default on mobile, toggleable */}
        <div className={`
             pointer-events-auto flex flex-wrap justify-center gap-2 md:gap-3 bg-black/80 md:bg-black/60 p-2 md:p-4 rounded-3xl border border-stark-800 backdrop-blur-xl shadow-2xl transition-all duration-300 origin-bottom
             ${showControls ? 'opacity-100 scale-100 translate-y-0 mb-2' : 'opacity-0 scale-90 translate-y-10 absolute pointer-events-none'}
             md:opacity-100 md:scale-100 md:translate-y-0 md:relative md:mb-0 md:pointer-events-auto
        `}>
           <StatusBadge label="FACE ID" active={isFaceLocked} color="red" />
           <StatusBadge label="CAM" active={isVideoActive} color="cyan" />
           <div className="w-[1px] bg-stark-800 mx-2 hidden md:block"></div>
           <span className="text-[9px] md:text-[10px] text-stark-500 self-center font-mono">VOICE PROTOCOLS ACTIVE</span>
        </div>

        {/* Shutdown Button - Always visible but kept small */}
        <div className="pointer-events-auto">
          <button 
            onClick={handleShutdown}
            className="w-10 h-10 md:w-14 md:h-14 rounded-full border-2 border-red-500/30 bg-red-900/40 text-red-500 flex items-center justify-center transition-all hover:bg-red-900/80 hover:scale-110 hover:shadow-[0_0_20px_rgba(239,68,68,0.6)]"
            title="SHUTDOWN SYSTEM"
          >
               <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 md:w-6 md:h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg>
          </button>
        </div>

      </div>
    </div>
  );
};

// Replaced ActionButton with StatusBadge for cleaner look since controls are voice-based
const StatusBadge = ({ label, color, active }: any) => {
    const colors: any = {
        cyan: 'text-cyan-400 border-cyan-500/50 bg-cyan-900/20',
        red: 'text-red-400 border-red-500/50 bg-red-900/20'
    };
    const style = active ? colors[color] : 'text-stark-500 border-stark-800 bg-black/50 opacity-50';

    return (
        <div className={`px-2 py-1 md:px-3 md:py-2 border rounded-lg text-[9px] md:text-[10px] font-bold tracking-widest transition-all ${style}`}>
            {label}
        </div>
    );
}

export default Assistant;
