
export enum AgentState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR',
  AGENT_PROCESSING = 'AGENT_PROCESSING'
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface PersonaConfig {
  name: string;
  tone: 'calm' | 'alert' | 'empathic';
  systemInstruction: string;
}

export interface AudioVisualizerData {
  frequencyData: Uint8Array;
  volume: number;
}

export interface LiveConfig {
  enableVideo?: boolean;
}

// Custom Tool Types
export type ToolName = 
  | 'switch_camera' 
  | 'play_youtube' 
  | 'reset_mirror'
  | 'generate_image'
  | 'log_developer_note'
  | 'robotics_scan'
  | 'face_analysis'
  | 'lightning_agent';

export interface ToolCallData {
  name: ToolName;
  args: Record<string, any>;
}

// Memory / Dev Note Types
export type NoteType = 'BUG_REPORT' | 'FEATURE_REQUEST' | 'GENERAL_LOG';

export interface DevNote {
  id: string;
  type: NoteType;
  content: string;
  timestamp: number;
  status: 'PENDING' | 'TRANSMITTED';
}
