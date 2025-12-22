import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";
import { MODELS, JARVIS_PERSONA } from "../constants";
import { base64ToFloat32Array, createPCMBlob } from "../utils/audioUtils";
import { ToolCallData } from "../types";

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'switch_camera',
    description: 'Switch user video camera.',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'play_youtube',
    description: 'Play a music video or song from YouTube. Provide a search query or song title.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'The song title or search query' }
      },
      required: ['query']
    }
  },
  {
    name: 'iot_command',
    description: 'Send command to IoT device. Use device name or ID (Main Lighting, Climate Control, etc.) and a value.',
    parameters: {
      type: Type.OBJECT, properties: {
        device: { type: Type.STRING, description: 'Name or ID of the device' },
        value: { type: Type.STRING, description: 'New value (e.g., true/false for lights, number for temperature)' }
      },
      required: ['device', 'value']
    }
  },
  {
    name: 'get_iot_status',
    description: 'Get status of all local IoT devices.',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'generate_image',
    description: 'Generate an image.',
    parameters: {
      type: Type.OBJECT,
      properties: { prompt: { type: Type.STRING } },
      required: ['prompt']
    }
  },
  {
    name: 'log_developer_note',
    description: 'Log a developer note.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        content: { type: Type.STRING },
        category: { type: Type.STRING, enum: ['BUG_REPORT', 'FEATURE_REQUEST', 'GENERAL_LOG'] }
      },
      required: ['content', 'category']
    }
  },
  {
    name: 'robotics_scan',
    description: 'Scan visual environment.',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'face_analysis',
    description: 'Analyze face in view.',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'lightning_agent',
    description: 'Strategic planning agent.',
    parameters: {
      type: Type.OBJECT,
      properties: { task: { type: Type.STRING } },
      required: ['task']
    }
  }
];

class LiveService {
  private client: GoogleGenAI | null = null;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private isMuted: boolean = false;
  private nextStartTime: number = 0;
  private scheduledSources: Set<AudioBufferSourceNode> = new Set();
  private outputAnalyser: AnalyserNode | null = null;
  private outputDataArray: Uint8Array | null = null;
  
  public onVolumeChange: ((vol: number) => void) | null = null;
  public onToolCall: ((tool: ToolCallData) => Promise<any>) | null = null;
  public onStateChange: ((isActive: boolean) => void) | null = null;
  public onTranscript: ((text: string, type: 'user' | 'model') => void) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor() {}

  public setMuted(muted: boolean) { this.isMuted = muted; }

  public async resumeAudio() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      try { await this.audioContext.resume(); } catch (e) { console.error(e); }
    }
  }

  private mapError(e: any, context: string): Error {
      const name = e.name || '';
      const message = e.message || '';
      if (name === 'NotAllowedError' || message.includes('denied')) {
          const err = new Error(`ACCESS_DENIED: ${context}`);
          (err as any).code = 'PERMISSION_DENIED';
          return err;
      }
      return new Error(`SYSTEM_FAILURE: ${context}`);
  }

  public async connect() {
    try {
      if (!process.env.API_KEY) throw new Error("MISSING AUTHENTICATION KEY");
      this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.outputAnalyser = this.audioContext.createAnalyser();
      this.outputAnalyser.fftSize = 1024; 
      this.outputAnalyser.smoothingTimeConstant = 0; 
      this.outputDataArray = new Uint8Array(this.outputAnalyser.frequencyBinCount);
      this.outputNode = this.audioContext.createGain();
      this.outputNode.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.audioContext.destination);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      } catch (e: any) { throw this.mapError(e, 'Audio Input'); }
      
      const config = {
        model: MODELS.LIVE,
        callbacks: {
          onopen: this.handleOpen.bind(this, stream),
          onmessage: this.handleMessage.bind(this),
          onerror: (e: any) => { if (this.onError) this.onError(new Error("NEURAL LINK SEVERED")); },
          onclose: () => this.disconnect(),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
          systemInstruction: JARVIS_PERSONA.systemInstruction,
          tools: [{ functionDeclarations: TOOLS }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };

      this.sessionPromise = this.client.live.connect(config);
      if (this.onStateChange) this.onStateChange(true);
    } catch (e: any) {
      if (this.onError) this.onError(e instanceof Error ? e : new Error(e.message));
      throw e;
    }
  }

  private handleOpen(stream: MediaStream) {
    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.inputSource = inputCtx.createMediaStreamSource(stream);
    this.processor = inputCtx.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (this.isMuted) return;
      const inputData = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const vol = Math.sqrt(sum / inputData.length);
      if (this.onVolumeChange) this.onVolumeChange(vol * 500); 
      const pcmBlob = createPCMBlob(inputData, 16000);
      this.sessionPromise?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
    };
    this.inputSource.connect(this.processor);
    this.processor.connect(inputCtx.destination);
  }

  public async playGreeting(text: string) {
    if (!this.client || !this.audioContext) return;
    try {
      const response = await this.client.models.generateContent({
        model: MODELS.TTS,
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
        },
      });
      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        const float32 = base64ToFloat32Array(audioData);
        const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
        buffer.copyToChannel(float32, 0);
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.outputNode!);
        source.start();
        if (this.onTranscript) this.onTranscript(text, 'model');
      }
    } catch (e) {
      console.error("Greeting failed", e);
    }
  }

  private async handleMessage(message: LiveServerMessage) {
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.audioContext) {
      const float32 = base64ToFloat32Array(audioData);
      const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outputNode!); 
      this.nextStartTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      this.scheduledSources.add(source);
      source.onended = () => this.scheduledSources.delete(source);
    }
    if (message.serverContent?.outputTranscription?.text) this.onTranscript?.(message.serverContent.outputTranscription.text, 'model');
    if (message.serverContent?.inputTranscription?.text) this.onTranscript?.(message.serverContent.inputTranscription.text, 'user');
    if (message.serverContent?.interrupted) this.clearAudioQueue();
    if (message.toolCall) {
      for (const call of message.toolCall.functionCalls) {
        let result = { result: "ok" };
        if (this.onToolCall) {
          try {
             const customResult = await this.onToolCall({ name: call.name as any, args: call.args as any });
             if (customResult) result = customResult;
          } catch (e) { result = { error: "Tool execution failed" } as any; }
        }
        this.sessionPromise?.then(session => session.sendToolResponse({
          functionResponses: { id: call.id, name: call.name, response: result }
        }));
      }
    }
  }

  public sendVideoFrame(base64Data: string) {
    this.sessionPromise?.then(session => session.sendRealtimeInput({
      media: { mimeType: 'image/jpeg', data: base64Data }
    }));
  }

  public clearAudioQueue() {
    this.scheduledSources.forEach(s => { try { s.stop(); } catch (e) {} });
    this.scheduledSources.clear();
    this.nextStartTime = this.audioContext?.currentTime || 0;
  }

  public disconnect() {
    this.inputSource?.disconnect();
    this.processor?.disconnect();
    this.clearAudioQueue();
    this.sessionPromise = null;
    this.client = null;
    if (this.onStateChange) this.onStateChange(false);
  }

  public getVoiceVisuals() {
    if (!this.outputAnalyser || !this.outputDataArray || !this.audioContext) return { volume: 0, bass: 0, mid: 0, treble: 0 };
    this.outputAnalyser.getByteFrequencyData(this.outputDataArray);
    const sampleRate = this.audioContext.sampleRate;
    const binCount = this.outputAnalyser.frequencyBinCount;
    const freqPerBin = (sampleRate / 2) / binCount;
    const getEnergy = (lowFreq: number, highFreq: number) => {
        const startBin = Math.floor(lowFreq / freqPerBin);
        const endBin = Math.floor(highFreq / freqPerBin);
        let sum = 0, count = 0;
        for (let i = startBin; i <= endBin && i < binCount; i++) { sum += this.outputDataArray![i]; count++; }
        return count > 0 ? (sum / count) / 255 : 0;
    };
    return { 
      volume: (this.outputDataArray.reduce((a, b) => a + b, 0) / binCount) / 255, 
      bass: getEnergy(50, 300), 
      mid: getEnergy(300, 2000), 
      treble: getEnergy(2000, 8000) 
    };
  }

  public getOutputVolume(): number { return this.getVoiceVisuals().volume; }
}

export const liveService = new LiveService();