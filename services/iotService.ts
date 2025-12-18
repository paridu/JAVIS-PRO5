
import { IotDevice } from "../types";

const STORAGE_KEY = 'jarvis_iot_hub';

class IotService {
  private devices: IotDevice[] = [
    { id: 'l1', name: 'Main Lighting', type: 'light', value: false, status: 'online', lastUpdated: Date.now() },
    { id: 'h1', name: 'Climate Control', type: 'hvac', value: 24, status: 'online', lastUpdated: Date.now() },
    { id: 's1', name: 'Secure Perimeter', type: 'security', value: 'LOCKED', status: 'online', lastUpdated: Date.now() },
    { id: 'p1', name: 'Arc Reactor Core', type: 'power', value: 98, status: 'online', lastUpdated: Date.now() },
  ];

  constructor() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      this.devices = JSON.parse(saved);
    }
  }

  private save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.devices));
  }

  public getDevices(): IotDevice[] {
    return [...this.devices];
  }

  public command(id: string, value: any): IotDevice | undefined {
    const device = this.devices.find(d => d.id === id || d.name.toLowerCase().includes(id.toLowerCase()));
    if (device) {
      device.value = value;
      device.lastUpdated = Date.now();
      this.save();
      return device;
    }
    return undefined;
  }

  public getStatusSummary(): string {
    return this.devices.map(d => `${d.name}: ${d.value} (${d.status})`).join(', ');
  }
}

export const iotService = new IotService();
