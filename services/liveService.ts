import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";
import { MODELS, JARVIS_PERSONA } from "../constants";
import { base64ToFloat32Array, createPCMBlob } from "../utils/audioUtils";
import { ToolCallData } from "../types";

// Tool Definitions
const TOOLS: FunctionDeclaration[] = [
  {
    name: 'switch_camera',
    description: 'Switch the user video input camera (e.g. front to back). Use when user asks to switch view.',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'play_youtube',
    description: 'Play a YouTube video or search for a video.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search query for the video' }
      },
      required: ['query']
    }
  },
  {
    name: 'generate_image',
    description: 'Generate or draw an image based on a prompt. Use when user asks to draw, design, or create a visual.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: 'The description of the image to generate' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'log_developer_note',
    description: 'Log a system note, bug report, or feature request to the memory core. Use when user mentions bugs, fixes, or ideas.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING, description: 'The content of the note or report' },
        category: { type: Type.STRING, enum: ['BUG_REPORT', 'FEATURE_REQUEST', 'GENERAL_LOG'], description: 'The category of the note' }
      },
      required: ['content', 'category']
    }
  },
  {
    name: 'robotics_scan',
    description: 'Analyze the visual environment for objects, hazards, and navigation. Use when user asks to scan area or check safety.',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'face_analysis',
    description: 'Analyze a face in the view for identity, age, and expression. Use when user asks "Who is this?" or "Analyze person".',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'lightning_agent',
    description: 'Activate advanced strategic planning agent for complex problems.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        task: { type: Type.STRING, description: 'The complex task or problem to solve' }
      },
      required: ['task']
    }
  }
];

class LiveService {
  private client: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private isMuted: boolean = false;
  
  // Audio Playback State
  private nextStartTime: number = 0;
  private scheduledSources: Set<AudioBufferSourceNode> = new Set();

  // Visualization Analysis
  private outputAnalyser: AnalyserNode | null = null;
  private outputDataArray: Uint8Array | null = null;
  
  // Callbacks
  public onVolumeChange: ((vol: number) => void) | null = null;
  public onToolCall: ((tool: ToolCallData) => Promise<any>) | null = null;
  public onStateChange: ((isActive: boolean) => void) | null = null;
  public onTranscript: ((text: string, type: 'user' | 'model') => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  private mapError(e: any, context: string): Error {
      console.error(`Error in ${context}:`, e);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
          return new Error(`ACCESS DENIED: ${context} Restricted`);
      }
      if (e.name === 'NotFoundError') {
          return new Error(`HARDWARE MISSING: ${context} Not Found`);
      }
      if (e.message && e.message.includes('429')) {
          return new Error("SYSTEM OVERLOAD: Rate Limit Exceeded");
      }
      return new Error(`SYSTEM FAILURE: ${context} Error`);
  }

  public async connect() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Setup Analyser for Lip Sync
      this.outputAnalyser = this.audioContext.createAnalyser();
      this.outputAnalyser.fftSize = 1024; // Increased resolution for better bass/treble separation
      this.outputAnalyser.smoothingTimeConstant = 0.04; // Extremely low smoothing for high responsiveness
      this.outputDataArray = new Uint8Array(this.outputAnalyser.frequencyBinCount);

      this.outputNode = this.audioContext.createGain();
      
      // Route: OutputNode -> Analyser -> Destination
      this.outputNode.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.audioContext.destination);

      // Get Mic Stream with enhanced error handling
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      } catch (e: any) {
        throw this.mapError(e, 'Audio Input');
      }
      
      // Config
      const config = {
        model: MODELS.LIVE,
        callbacks: {
          onopen: this.handleOpen.bind(this, stream),
          onmessage: this.handleMessage.bind(this),
          onerror: (e: any) => {
            console.error("Live API Error:", e);
            if (this.onError) this.onError(new Error("NEURAL LINK SEVERED"));
          },
          onclose: () => {
            console.log("Live API Closed");
            this.disconnect();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: JARVIS_PERSONA.systemInstruction,
          tools: [
            { functionDeclarations: TOOLS }
          ],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };

      this.sessionPromise = this.client.live.connect(config);
      if (this.onStateChange) this.onStateChange(true);
    } catch (e: any) {
      if (this.onError) this.onError(e instanceof Error ? e : new Error(e.message || "Unknown Connection Error"));
      throw e;
    }
  }

  private handleOpen(stream: MediaStream) {
    console.log("Live Session Connected");
    
    // Setup Audio Input Processing (Mic -> 16kHz PCM -> API)
    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.inputSource = inputCtx.createMediaStreamSource(stream);
    this.processor = inputCtx.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (this.isMuted) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate Volume for Visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const vol = Math.sqrt(sum / inputData.length);
      if (this.onVolumeChange) this.onVolumeChange(vol * 500); // Scale up for UI

      // Send to API
      const pcmBlob = createPCMBlob(inputData, 16000);
      this.sessionPromise?.then(session => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(inputCtx.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Audio Output (Server -> User)
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.audioContext) {
      const float32 = base64ToFloat32Array(audioData);
      const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outputNode!); // Connect to outputNode which now feeds into Analyser

      // Audio Scheduling
      this.nextStartTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      
      this.scheduledSources.add(source);
      source.onended = () => this.scheduledSources.delete(source);
    }

    // 2. Handle Transcription
    if (message.serverContent?.outputTranscription?.text) {
      this.onTranscript?.(message.serverContent.outputTranscription.text, 'model');
    }
    if (message.serverContent?.inputTranscription?.text) {
      this.onTranscript?.(message.serverContent.inputTranscription.text, 'user');
    }

    // 3. Handle Interrupts
    if (message.serverContent?.interrupted) {
      this.clearAudioQueue();
    }

    // 4. Handle Tool Calls
    if (message.toolCall) {
      for (const call of message.toolCall.functionCalls) {
        console.log("Tool Call:", call.name, call.args);
        
        let result = { result: "ok" };
        if (this.onToolCall) {
          try {
             // Execute client-side tool logic
             const customResult = await this.onToolCall({ name: call.name as any, args: call.args as any });
             if (customResult) result = customResult;
          } catch (e) {
             console.error("Tool execution error", e);
             result = { error: "Tool execution failed" } as any;
          }
        }

        // Send Response back to model
        this.sessionPromise?.then(session => {
          session.sendToolResponse({
            functionResponses: {
              id: call.id,
              name: call.name,
              response: result
            }
          });
        });
      }
    }
  }

  public sendVideoFrame(base64Data: string) {
    this.sessionPromise?.then(session => {
      session.sendRealtimeInput({
        media: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      });
    });
  }

  public clearAudioQueue() {
    this.scheduledSources.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    this.scheduledSources.clear();
    this.nextStartTime = this.audioContext?.currentTime || 0;
  }

  public disconnect() {
    this.inputSource?.disconnect();
    this.processor?.disconnect();
    this.clearAudioQueue();
    if (this.onStateChange) this.onStateChange(false);
    this.sessionPromise = null;
  }

  /**
   * GRANULAR VISUALIZATION ENGINE
   * Maps frequency bins to specific phoneme drivers.
   */
  public getVoiceVisuals() {
    if (!this.outputAnalyser || !this.outputDataArray || !this.audioContext) {
        return { volume: 0, bass: 0, mid: 0, treble: 0 };
    }
    
    this.outputAnalyser.getByteFrequencyData(this.outputDataArray);
    
    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.outputAnalyser.frequencyBinCount;
    const freqPerBin = (sampleRate / 2) / binCount;

    // Helper to extract energy from a specific frequency range
    const getEnergy = (lowFreq: number, highFreq: number) => {
        const startBin = Math.floor(lowFreq / freqPerBin);
        const endBin = Math.floor(highFreq / freqPerBin);
        let sum = 0;
        let count = 0;
        for (let i = startBin; i <= endBin && i < binCount; i++) {
            sum += this.outputDataArray![i];
            count++;
        }
        return count > 0 ? (sum / count) / 255 : 0;
    };

    // Range Definitions for Phonemes
    // Bass (50-300Hz): Fundamental frequency. Drives Vowels (A, O, U) -> Open Mouth / Vertical Stretch
    const bass = getEnergy(50, 300);
    
    // Mid (300-2000Hz): Formants. Drives Tone/Intensity -> General Activity
    const mid = getEnergy(300, 2000);
    
    // Treble (2000Hz+): Sibilance/Fricatives. Drives Consonants (S, T, Ch) -> Jitter / Horizontal Shake
    const treble = getEnergy(2000, 8000);

    // Overall RMS Volume
    let totalSum = 0;
    for(let i=0; i<binCount; i++) totalSum += this.outputDataArray[i];
    const volume = (totalSum / binCount) / 255;

    return { volume, bass, mid, treble };
  }

  public getOutputVolume(): number {
      return this.getVoiceVisuals().volume;
  }
}

export const liveService = new LiveService();