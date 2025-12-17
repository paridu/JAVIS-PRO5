
import { DevNote, NoteType } from "../types";

export interface FaceRecord {
  id: string;
  identity: string;
  age: string;
  expression: string;
  timestamp: number;
}

const STORAGE_KEY_FACES = 'jarvis_face_memory';
const STORAGE_KEY_NOTES = 'jarvis_dev_notes';

class MemoryService {
  // --- Face Memory ---
  public saveFace(data: any): FaceRecord {
    const records = this.getFaces();
    
    const newRecord: FaceRecord = {
      id: crypto.randomUUID(),
      identity: data.identity_guess || "Unknown Subject",
      age: data.age_range || "Unknown",
      expression: data.expression || "Neutral",
      timestamp: Date.now()
    };

    // Prepend to list (newest first)
    records.unshift(newRecord);
    
    // Keep only last 50 records to save space
    if (records.length > 50) records.pop();

    localStorage.setItem(STORAGE_KEY_FACES, JSON.stringify(records));
    return newRecord;
  }

  public getFaces(): FaceRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY_FACES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Memory Read Error", e);
      return [];
    }
  }

  public clearMemory() {
    localStorage.removeItem(STORAGE_KEY_FACES);
    localStorage.removeItem(STORAGE_KEY_NOTES);
  }

  // --- Developer Notes / System Logs ---
  
  public saveNote(content: string, type: NoteType): DevNote {
    const notes = this.getNotes();
    
    const newNote: DevNote = {
        id: crypto.randomUUID(),
        content: content,
        type: type,
        timestamp: Date.now(),
        status: 'PENDING'
    };

    notes.unshift(newNote);
    localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(notes));
    return newNote;
  }

  public getNotes(): DevNote[] {
      try {
          const data = localStorage.getItem(STORAGE_KEY_NOTES);
          return data ? JSON.parse(data) : [];
      } catch (e) {
          return [];
      }
  }

  public markAllAsTransmitted() {
      const notes = this.getNotes();
      const updated = notes.map(n => ({ ...n, status: 'TRANSMITTED' as const }));
      localStorage.setItem(STORAGE_KEY_NOTES, JSON.stringify(updated));
  }
}

export const memoryService = new MemoryService();
