import { create } from 'zustand';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  context: string;
  message: string;
  data?: any;
}

interface LogStore {
  logs: LogEntry[];
  addLog: (level: LogLevel, context: string, message: string, data?: any) => void;
  clearLogs: () => void;
  getLogsAsString: () => string;
}

export const useLogStore = create<LogStore>((set, get) => ({
  logs: [],
  addLog: (level, context, message, data) => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      data,
    };
    set((state) => ({ logs: [entry, ...state.logs] }));
    console.log(`[${level}] ${context}: ${message}`, data ? JSON.stringify(data) : '');
  },
  clearLogs: () => set({ logs: [] }),
  getLogsAsString: () => {
    const logs = get().logs;
    return logs.map(l => {
      let str = `[${l.timestamp}] [${l.level}] [${l.context}] ${l.message}`;
      if (l.data) {
        try {
          str += `\nData: ${JSON.stringify(l.data, null, 2)}`;
        } catch (e) {
          str += `\nData: [Unserializable]`;
        }
      }
      return str;
    }).join('\n\n------------------------\n\n');
  }
}));
