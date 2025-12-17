
import { GoogleGenAI, Chat, GenerateContentResponse, Part, Type } from "@google/genai";
import { MODELS, JARVIS_PERSONA } from "../constants";
import { NoteType } from "../types";

export interface NonLiveConfig {
  image?: string; // base64
}

class GeminiService {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // Helper
  private base64ToPart(base64Data: string, mimeType: string = 'image/png'): Part {
    // Strip header if present
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    return {
      inlineData: {
        mimeType,
        data: cleanBase64
      }
    };
  }

  private handleError(error: any, context: string): string {
      console.error(`${context} Error`, error);
      const msg = error.message || '';
      if (msg.includes('429')) return `SYSTEM OVERLOAD: ${context} Rate Limit Exceeded.`;
      if (msg.includes('Network') || msg.includes('fetch')) return `CONNECTION FAILURE: ${context} Network Unreachable.`;
      return `PROCESSING ERROR: ${context} Failed.`;
  }

  // Task 1: Image Generation / Editing (Flash Image)
  public async generateImage(prompt: string): Promise<{ text: string; image?: string }> {
    try {
      const response = await this.client.models.generateContent({
        model: MODELS.IMAGE_GEN,
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      let imageUrl: string | undefined;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        }
      }

      if (!imageUrl) return { text: "Unable to synthesize visual data." };
      return { text: "Rendering complete.", image: imageUrl };
    } catch (error) {
       return { text: this.handleError(error, "Image Generation") };
    }
  }

  // Task 2: Deep Thought (Pro Preview)
  public async deepThought(prompt: string): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: MODELS.THINKING,
        contents: { parts: [{ text: prompt }] },
        config: {
          systemInstruction: JARVIS_PERSONA.systemInstruction,
          thinkingConfig: { thinkingBudget: 4096 } // Enable Thinking
        }
      });
      return response.text || "No analysis produced.";
    } catch (error) {
      return this.handleError(error, "Deep Thought Protocol");
    }
  }

  // Task 3: Robotics Scan (Flash -> JSON)
  public async roboticsScan(base64Image: string): Promise<any> {
    try {
      const response = await this.client.models.generateContent({
        model: MODELS.ROBOTICS,
        contents: {
          parts: [
            this.base64ToPart(base64Image),
            { text: "Analyze this scene for robotic navigation. Return JSON with 'objects', 'hazards', and 'navigable_path' (boolean)." }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              objects: { type: Type.ARRAY, items: { type: Type.STRING } },
              hazards: { type: Type.ARRAY, items: { type: Type.STRING } },
              navigable_path: { type: Type.BOOLEAN }
            }
          }
        }
      });
      
      return JSON.parse(response.text || "{}");
    } catch (error) {
      console.error("Robotics Scan Error", error);
      return { error: "Scan Failed" };
    }
  }

  // Task 4: Face Analysis
  public async analyzeFace(base64Image: string): Promise<any> {
    try {
      const response = await this.client.models.generateContent({
        model: MODELS.ROBOTICS, // Flash is versatile enough
        contents: {
          parts: [
            this.base64ToPart(base64Image),
            { text: "Analyze the face in this image. Estimate age range, gender, and facial expression. If they look like a celebrity or specific character, mention it as 'identity_guess'. Return JSON." }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              age_range: { type: Type.STRING },
              gender: { type: Type.STRING },
              expression: { type: Type.STRING },
              identity_guess: { type: Type.STRING }
            }
          }
        }
      });
      return JSON.parse(response.text || "{}");
    } catch (error) {
      console.error("Face Analysis Error", error);
      return { error: "Face Scan Failed" };
    }
  }

  // Task 5: Lightning Agent (Strategic Agent)
  public async runLightningAgent(prompt: string, imageBase64?: string): Promise<string> {
    try {
        const parts: Part[] = [];
        if (imageBase64) {
            parts.push(this.base64ToPart(imageBase64));
        }
        
        const systemPrompt = `
          IDENTITY: You are the "Lightning Agent", a specialized sub-module of JARVIS designed for high-velocity strategic planning and multi-step reasoning.
          
          PROTOCOL:
          1. Analyze the user's request.
          2. Formulate a step-by-step execution plan.
          3. If visual data is provided, integrate it into your strategy.
          4. Output the final plan and conclusion in a structured, concise Markdown format.
          5. Use emojis (⚡, 🧠, 🛡️) to denote key sections.
        `;

        parts.push({ text: prompt });

        const response = await this.client.models.generateContent({
            model: MODELS.THINKING, // Using Pro 3 for high intelligence
            contents: { parts: parts },
            config: {
                systemInstruction: systemPrompt,
                thinkingConfig: { thinkingBudget: 2048 }, // Balanced for speed/intelligence
            }
        });

        return response.text || "AGENT PROCESS TERMINATED UNEXPECTEDLY.";
    } catch (error) {
        return this.handleError(error, "Lightning Agent Protocol");
    }
  }

  // Task 6: Developer Note Categorization
  public async categorizeNote(text: string): Promise<{ type: NoteType; summary: string }> {
      try {
          const response = await this.client.models.generateContent({
              model: MODELS.LIVE, // Use Flash for speed
              contents: {
                  parts: [{ text: `Analyze this user statement and classify it for a Developer Log.
                  If it mentions a bug, error, or fix needed, classify as "BUG_REPORT".
                  If it mentions a new idea, improvement, or future plan, classify as "FEATURE_REQUEST".
                  Otherwise, "GENERAL_LOG".
                  Also provide a very short 5-word summary.
                  Input: "${text}"` }]
              },
              config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                      type: Type.OBJECT,
                      properties: {
                          type: { type: Type.STRING, enum: ["BUG_REPORT", "FEATURE_REQUEST", "GENERAL_LOG"] },
                          summary: { type: Type.STRING }
                      }
                  }
              }
          });
          const json = JSON.parse(response.text || "{}");
          return {
              type: json.type || "GENERAL_LOG",
              summary: json.summary || text.slice(0, 20)
          };
      } catch (error) {
          return { type: 'GENERAL_LOG', summary: text.slice(0, 20) };
      }
  }
}

export const geminiService = new GeminiService();
