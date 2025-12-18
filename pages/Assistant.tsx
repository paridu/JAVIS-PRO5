import React, { useState, useEffect, useRef } from 'react';
import JarvisFace from '../components/JarvisFace';
import { liveService } from '../services/liveService';
import { geminiService } from '../services/geminiService';
import { memoryService } from '../services/memoryService'; 
import { AgentState, ToolCallData, NoteType } from '../types';
import { JARVIS_PERSONA } from '../constants';

const Assistant: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [state, setState] = useState<AgentState>(AgentState.IDLE);
  const [lastTranscript, setLastTranscript] = useState<string>("SYSTEM INITIALIZING...");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [roboticsData, setRoboticsData] = useState<any>(null);
  const [agentReport, setAgentReport] = useState<string | null>(null);
  const [faceData, setFaceData] = useState<any>(null);
  const [isFaceLocked, setIsFaceLocked] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [isLogging, setIsLogging] = useState(false); 
  const [liveVolume, setLiveVolume] = useState(0);
  const [isMirrored, setIsMirrored] = useState(true); 
  const [showControls, setShowControls] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [accessErrorCode, setAccessErrorCode] = useState<string | null>(null);

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
    if (isLogging) setActiveFeature("MEMORY WRITE PROTOCOL");
    else if (state === AgentState.AGENT_PROCESSING) setActiveFeature("LIGHTNING AGENT");
    else if (state === AgentState.THINKING) setActiveFeature("NEURAL PROCESSING");
    else if (isFaceLocked) setActiveFeature("BIOMETRIC TRACKING");
    else if (generatedImage) setActiveFeature("VISUAL SYNTHESIS");
    else if (roboticsData) setActiveFeature("ENVIRONMENTAL SENSORS");
    else if (state === AgentState.ERROR) setActiveFeature("SYSTEM ERROR");
    else setActiveFeature(null);
  }, [state, isFaceLocked, generatedImage, roboticsData, isLogging]);

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
      let msg = "VISUAL SENSORS OFFLINE";
      if (e.name === 'NotAllowedError' || e.message?.includes('denied')) msg = "VISUAL ACCESS DENIED";
      else if (e.name === 'NotFoundError') msg = "NO CAMERA DETECTED";
      setLastTranscript(msg);
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
    liveService.onStateChange = (isActive) => {
      if (!isActive) {
          if (isInitializedRef.current && !isExplicitShutdownRef.current) {
              setLastTranscript("CONNECTION LOST - REROUTING...");
              setState(AgentState.CONNECTING);
              setTimeout(() => { handleSystemStart(); }, 2000);
          } else {
              setState(AgentState.IDLE);
          }
      }
    };

    liveService.onError = (error) => {
        const errorMsg = error.message || "Unknown System Failure";
        const code = (error as any).code;
        setLastTranscript(`ERROR: ${errorMsg}`);
        setState(AgentState.ERROR);
        if (code === 'PERMISSION_DENIED') setAccessErrorCode('PERMISSION_DENIED');
        else if (code === 'NOT_FOUND') setAccessErrorCode('HARDWARE_MISSING');
        if (!isExplicitShutdownRef.current) {
            memoryService.saveNote(`SYSTEM FAULT: ${errorMsg} [CODE: ${code || 'NONE'}]`, 'BUG_REPORT');
            setIsLogging(true);
            setTimeout(() => setIsLogging(false), 2000);
        }
        if (code !== 'PERMISSION_DENIED' && code !== 'NOT_FOUND') {
            setTimeout(() => {
                if (stateRef.current === AgentState.ERROR && !isExplicitShutdownRef.current) {
                    handleSystemStart();
                } else if (stateRef.current === AgentState.ERROR) {
                    setState(AgentState.IDLE);
                    setLastTranscript("SYSTEM STANDBY");
                }
            }, 4000);
        }
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

    liveService.onToolCall = async (tool: ToolCallData) => {
      setLastTranscript(`EXECUTING PROTOCOL: ${tool.name.toUpperCase()}`);
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
                  setIsLogging(true);
                  memoryService.saveNote(tool.args.content, tool.args.category as NoteType);
                  setLastTranscript(`LOG SAVED: ${tool.args.category}`);
                  setTimeout(() => setIsLogging(false), 2500);
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
                   setLastTranscript("TARGET ACQUIRED. ANALYZING...");
                   setIsFaceLocked(true); 
                   setFaceData(null); 
                   try {
                       const json = await geminiService.analyzeFace(frame);
                       if (json.error) throw new Error(json.error);
                       setFaceData(json);
                       memoryService.saveFace(json);
                       setLastTranscript(`IDENTITY CONFIRMED: ${json.identity_guess || "UNKNOWN"}`);
                       return { result: "Face analysis complete", data: json };
                   } catch (e) {
                       setIsFaceLocked(false);
                       setLastTranscript("ANALYSIS FAILED");
                       return { error: "Face analysis failed" };
                   }
              }
              case 'lightning_agent': {
                   setState(AgentState.AGENT_PROCESSING);
                   const frame = getCurrentFrame() || undefined; 
                   const report = await geminiService.runLightningAgent(tool.args.task, frame);
                   setAgentReport(report);
                   setState(AgentState.IDLE);
                   return { result: "Agent report generated" };
              }
              default:
                  return { result: "Tool executed" };
          }
      } catch (e: any) {
          setState(AgentState.IDLE);
          return { error: `Execution failed: ${e.message}` };
      }
    };
  }, []); 

  const handleSystemStart = async () => {
    isExplicitShutdownRef.current = false;
    setAccessErrorCode(null);
    setLastTranscript("ESTABLISHING SECURE CONNECTION...");
    try {
        setState(AgentState.CONNECTING);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
            stream.getTracks().forEach(t => t.stop());
        } catch (e: any) {}
        
        await liveService.connect();
        setIsInitialized(true);
        if (!isVideoActive) await startVideo();
        
        setState(AgentState.IDLE);
        setLastTranscript("SYSTEM ONLINE - LISTENING");

        // Trigger JARVIS initial greeting and status report
        liveService.sendTextMessage("SYSTEM_READY_CHECK: สวัสดีครับจาร์วิส กรุณารายงานความพร้อมของระบบและสรุปฟีเจอร์ที่คุณสามารถทำได้ให้ผมฟังหน่อย");

    } catch (e: any) {
        setState(AgentState.ERROR);
        const code = (e as any).code;
        if (code === 'PERMISSION_DENIED') {
            setAccessErrorCode('PERMISSION_DENIED');
            setLastTranscript("PROTOCOL BLOCKED: HARDWARE RESTRICTED");
        } else if (code === 'NOT_FOUND') {
            setAccessErrorCode('HARDWARE_MISSING');
            setLastTranscript("ERROR: NO INPUT HARDWARE FOUND");
        } else {
            setLastTranscript(e.message || "INITIALIZATION FAILED");
        }
    }
  };

  const handleShutdown = () => {
    isExplicitShutdownRef.current = true;
    liveService.disconnect();
    stopVideo();
    setIsInitialized(false);
    setState(AgentState.IDLE);
    setLastTranscript("SYSTEM OFFLINE");
    setShowControls(false);
  };

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      <div className={`fixed inset-0 z-0 transition-opacity duration-1000 ${isVideoActive ? 'opacity-100' : 'opacity-0'}`}>
        <video ref={videoRef} className={`w-full h-full object-cover ${isMirrored ? 'transform scale-x-[-1]' : ''}`} muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 bg-black/30"></div>
      </div>

      {accessErrorCode && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl animate-fade-in p-6">
              <div className="max-w-md w-full border-2 border-red-500 bg-red-950/20 p-8 rounded-2xl shadow-[0_0_50px_rgba(239,68,68,0.4)] text-center font-mono">
                  <div className="mb-6 flex justify-center">
                      <div className="w-16 h-16 border-4 border-red-500 rounded-full flex items-center justify-center animate-pulse">
                          <span className="text-3xl font-bold text-red-500">!</span>
                      </div>
                  </div>
                  <h2 className="text-2xl font-bold text-red-500 tracking-widest mb-4">SECURITY PROTOCOL BLOCK</h2>
                  <p className="text-stark-400 text-sm leading-relaxed mb-8">
                      {accessErrorCode === 'PERMISSION_DENIED' 
                        ? "Neural link initialization failed. Audio/Visual hardware access has been explicitly restricted by the system administrator. Manual re-authorization is required."
                        : "Required hardware components (Microphone/Camera) were not detected in the current configuration. Please verify system peripherals."
                      }
                  </p>
                  <div className="flex flex-col gap-3">
                      <button onClick={handleSystemStart} className="w-full py-4 bg-red-500 text-white font-bold tracking-[0.2em] hover:bg-red-600 transition-all rounded-lg shadow-lg">RE-ESTABLISH NEURAL LINK</button>
                      <button onClick={() => setAccessErrorCode(null)} className="text-stark-600 text-xs hover:text-stark-400 transition-colors py-2">DISMISS ALERT (STANDBY MODE)</button>
                  </div>
              </div>
          </div>
      )}

      {activeFeature && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-auto">
              <div className="flex flex-col items-center justify-center animate-pulse-fast">
                  <div className="px-6 py-2 bg-green-900/40 border border-green-500 backdrop-blur-md rounded-full shadow-[0_0_20px_rgba(34,197,94,0.4)] flex items-center gap-3">
                      <div className="w-2 h-2 bg-green-400 rounded-full animate-ping"></div>
                      <span className="text-green-400 font-mono text-xs md:text-sm font-bold tracking-[0.2em] uppercase whitespace-nowrap">{activeFeature} ACTIVE</span>
                  </div>
                  <div className="h-4 w-[1px] bg-green-500/50"></div>
              </div>
          </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center relative z-10 pointer-events-none mb-32">
        <div className={`w-[90vw] max-w-[500px] aspect-square relative transition-opacity duration-500 ${isFaceLocked ? 'opacity-20' : 'opacity-100'} pointer-events-auto`}>
          {generatedImage ? (
             <div className="relative h-full w-full border-2 border-stark-gold rounded-lg overflow-hidden shadow-[0_0_50px_rgba(251,191,36,0.5)]">
               <img src={generatedImage} onClick={() => setGeneratedImage(null)} className="w-full h-full object-cover cursor-pointer" />
               <div className="absolute bottom-0 bg-black/80 w-full text-center text-xs text-stark-gold py-1">CLICK TO DISMISS</div>
             </div>
          ) : (
             <JarvisFace state={state} tone={JARVIS_PERSONA.tone} />
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
        </div>
      </div>

      <div className="fixed bottom-20 md:bottom-8 left-0 right-0 z-30 flex flex-col items-center gap-4 pointer-events-none px-4">
        <div className="pointer-events-auto md:hidden">
            <button onClick={() => setShowControls(!showControls)} className={`w-8 h-8 rounded-full border border-stark-500/50 bg-black/60 backdrop-blur text-stark-500 flex items-center justify-center transition-all shadow-lg ${showControls ? 'bg-stark-500 text-black rotate-180' : 'hover:bg-stark-500/20'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M3 6a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3V6ZM3 15.75a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2.25Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3v-2.25Z" clipRule="evenodd" /></svg>
            </button>
        </div>
        <div className={`pointer-events-auto flex flex-wrap justify-center gap-2 md:gap-3 bg-black/80 md:bg-black/60 p-2 md:p-4 rounded-3xl border border-stark-800 backdrop-blur-xl shadow-2xl transition-all duration-300 origin-bottom ${showControls ? 'opacity-100 scale-100 translate-y-0 mb-2' : 'opacity-0 scale-90 translate-y-10 absolute pointer-events-none'} md:opacity-100 md:scale-100 md:translate-y-0 md:relative md:mb-0 md:pointer-events-auto`}>
           <StatusBadge label="FACE ID" active={isFaceLocked} color="red" />
           <StatusBadge label="CAM" active={isVideoActive} color="cyan" />
           <div className="w-[1px] bg-stark-800 mx-2 hidden md:block"></div>
           <span className="text-[9px] md:text-[10px] text-stark-500 self-center font-mono uppercase">Neural link monitoring</span>
        </div>
        <div className="pointer-events-auto">
          {!isInitialized && !accessErrorCode ? (
              <button onClick={handleSystemStart} className="px-8 py-3 bg-stark-gold text-black font-bold tracking-[0.2em] rounded-full shadow-[0_0_20px_rgba(251,191,36,0.6)] hover:scale-110 transition-all animate-pulse">AUTHORIZE SYSTEM</button>
          ) : (
              <button onClick={handleShutdown} className="w-10 h-10 md:w-14 md:h-14 rounded-full border-2 border-red-500/30 bg-red-900/40 text-red-500 flex items-center justify-center transition-all hover:bg-red-900/80 hover:scale-110 hover:shadow-[0_0_20px_rgba(239,68,68,0.6)]" title="SHUTDOWN SYSTEM"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 md:w-6 md:h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg></button>
          )}
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ label, color, active }: any) => {
    const colors: any = { cyan: 'text-cyan-400 border-cyan-500/50 bg-cyan-900/20', red: 'text-red-400 border-red-500/50 bg-red-900/20' };
    const style = active ? colors[color] : 'text-stark-500 border-stark-800 bg-black/50 opacity-50';
    return ( <div className={`px-2 py-1 md:px-3 md:py-2 border rounded-lg text-[9px] md:text-[10px] font-bold tracking-widest transition-all ${style}`}>{label}</div> );
}

export default Assistant;