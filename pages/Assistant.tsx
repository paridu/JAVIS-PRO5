
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
  const [faceData, setFaceData] = useState<any>(null);
  const [isFaceLocked, setIsFaceLocked] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [isLogging, setIsLogging] = useState(false); 
  const [liveVolume, setLiveVolume] = useState(0);
  const [isMirrored, setIsMirrored] = useState(true); 
  const [showControls, setShowControls] = useState(false);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [accessErrorCode, setAccessErrorCode] = useState<string | null>(null);
  const [iotDevices, setIotDevices] = useState<IotDevice[]>([]);

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
    // Dynamic HUD logic
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
        const errorMsg = error.message || "Unknown Failure";
        const code = (error as any).code;
        setLastTranscript(`ERROR: ${errorMsg}`);
        setState(AgentState.ERROR);
        if (code === 'PERMISSION_DENIED') setAccessErrorCode('PERMISSION_DENIED');
        else if (code === 'NOT_FOUND') setAccessErrorCode('HARDWARE_MISSING');
    };

    liveService.onTranscript = (text, type) => {
      setLastTranscript(type === 'user' ? `USER: ${text}` : `JARVIS: ${text}`);
      if (type === 'model') {
        setState(AgentState.SPEAKING);
        setTimeout(() => { if (stateRef.current === AgentState.SPEAKING) setState(AgentState.IDLE); }, 3000);
      }
    };

    liveService.onVolumeChange = (vol) => {
       setLiveVolume(vol);
       if (vol > 10 && ![AgentState.SPEAKING, AgentState.THINKING, AgentState.ERROR, AgentState.AGENT_PROCESSING].includes(stateRef.current)) {
           setState(AgentState.LISTENING);
       } else if (vol <= 10 && stateRef.current === AgentState.LISTENING) {
           setState(AgentState.IDLE);
       }
    };

    liveService.onToolCall = async (tool: ToolCallData) => {
      setLastTranscript(`IOT PROTOCOL: ${tool.name.toUpperCase()}`);
      try {
          switch (tool.name) {
              case 'iot_command': {
                  setIntention(IntentionState.INTERVENE);
                  const result = iotService.command(tool.args.device, tool.args.value);
                  setIotDevices(iotService.getDevices());
                  setTimeout(() => setIntention(IntentionState.MONITOR), 2000);
                  return result ? { result: `Success: ${tool.args.device} set to ${tool.args.value}` } : { error: "Device not found" };
              }
              case 'get_iot_status': {
                  setIntention(IntentionState.MONITOR);
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
              case 'lightning_agent': {
                   setState(AgentState.AGENT_PROCESSING);
                   const frame = getCurrentFrame() || undefined; 
                   const report = await geminiService.runLightningAgent(tool.args.task, frame);
                   setAgentReport(report);
                   setState(AgentState.IDLE);
                   return { result: "Report generated" };
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
    setAccessErrorCode(null);
    setLastTranscript("LINKING TO IOT HUB...");
    try {
        setState(AgentState.CONNECTING);
        await liveService.connect();
        setIsInitialized(true);
        if (!isVideoActive) await startVideo();
        setState(AgentState.IDLE);
        setIntention(IntentionState.MONITOR);
        liveService.playGreeting("สวัสดีครับ ผมจาร์วิส ระบบ Edge AI ประจำบ้านพร้อมปฏิบัติการแล้วครับ");
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

      {/* IoT Tactical HUD */}
      <div className="absolute top-20 left-6 z-40 hidden lg:flex flex-col gap-3 pointer-events-none">
          <div className="bg-black/60 border-l-2 border-cyan-500 p-3 backdrop-blur-md">
              <span className="text-[10px] text-cyan-500 block font-bold tracking-widest mb-2">IOT SENSOR ARRAY</span>
              <div className="space-y-2">
                  {iotDevices.map(d => (
                      <div key={d.id} className="flex items-center justify-between gap-8">
                          <span className="text-[10px] text-stark-400 uppercase">{d.name}</span>
                          <span className={`text-[10px] font-bold ${d.value === true || d.value === 'LOCKED' ? 'text-green-400' : 'text-stark-gold'}`}>
                              {d.value === true ? 'ON' : d.value === false ? 'OFF' : d.value}
                          </span>
                      </div>
                  ))}
              </div>
          </div>
          <div className="bg-black/60 border-l-2 border-stark-gold p-3 backdrop-blur-md">
              <span className="text-[10px] text-stark-gold block font-bold tracking-widest mb-1">AGENT INTENTION</span>
              <span className="text-xs text-white font-mono animate-pulse">{intention}</span>
          </div>
      </div>

      {/* Main UI Layer */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 pointer-events-none mb-32">
        <div className="w-[85vw] max-w-[420px] aspect-square relative pointer-events-auto">
             <JarvisFace state={state} tone={JARVIS_PERSONA.tone} />
             <div className={`absolute inset-0 rounded-full border-2 transition-all duration-1000 opacity-20 scale-110
                 ${intention === IntentionState.INTERVENE ? 'border-red-500 animate-ping' : 
                   intention === IntentionState.ALERT ? 'border-orange-500' : 
                   intention === IntentionState.MONITOR ? 'border-cyan-500' : 'border-stark-gold'}`}></div>
        </div>

        <div className="mt-6 text-center px-6 max-w-3xl min-h-[60px] pointer-events-auto">
           <p className={`font-mono text-sm md:text-lg tracking-widest transition-colors duration-300 ${
               state === AgentState.SPEAKING ? 'text-stark-gold font-bold' : 'text-stark-500'
           }`}>
             {lastTranscript}
           </p>
        </div>
      </div>

      {/* Optimized Mobile Control Panel */}
      <div className="fixed bottom-20 md:bottom-24 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 pointer-events-none">
          {/* Collapsible Tactical Panel */}
          <div className={`flex flex-wrap justify-center gap-2 p-3 bg-black/80 backdrop-blur-xl border border-stark-800 rounded-2xl shadow-2xl transition-all duration-500 origin-bottom pointer-events-auto ${showControls ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none h-0 p-0 overflow-hidden'}`}>
              <button onClick={handleCameraSwitch} className="px-3 py-1.5 bg-stark-900 border border-cyan-500/30 text-cyan-400 text-[9px] font-bold tracking-widest uppercase rounded hover:bg-cyan-500 hover:text-black">Switch Cam</button>
              <button onClick={() => setRoboticsData(null)} className="px-3 py-1.5 bg-stark-900 border border-stark-gold/30 text-stark-gold text-[9px] font-bold tracking-widest uppercase rounded hover:bg-stark-gold hover:text-black">Reset HUD</button>
              <button onClick={() => { liveService.disconnect(); setIsInitialized(false); }} className="px-3 py-1.5 bg-red-950/20 border border-red-500/30 text-red-500 text-[9px] font-bold tracking-widest uppercase rounded hover:bg-red-500 hover:text-white">Shutdown</button>
          </div>

          {/* Toggle / Main Action Button */}
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
    </div>
  );
};

export default Assistant;
