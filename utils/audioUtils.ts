
// Utilities for handling PCM Audio for Gemini Live API

export function base64ToFloat32Array(base64: string): Float32Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Convert Int16 bytes to Float32 [-1, 1]
  const dataInt16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(dataInt16.length);
  for (let i = 0; i < dataInt16.length; i++) {
    float32[i] = dataInt16[i] / 32768.0;
  }
  return float32;
}

export function float32ToB64PCM16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    // Clamp values
    let val = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = val < 0 ? val * 0x8000 : val * 0x7FFF;
  }
  
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createPCMBlob(data: Float32Array, sampleRate: number = 16000): { data: string; mimeType: string } {
  return {
    data: float32ToB64PCM16(data),
    mimeType: `audio/pcm;rate=${sampleRate}`,
  };
}
