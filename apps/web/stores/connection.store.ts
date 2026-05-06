import { create } from "zustand";

export type Phase =
  | "idle"
  | "creating"
  | "joining"
  | "signaling"
  | "connected"
  | "reconnecting"
  | "error";

interface ConnectionStore {
  phase: Phase;
  roomCode: string | null;
  wsRetryCount: number;
  iceRestartCount: number;
  error: string | null;
  setPhase: (phase: Phase) => void;
  setRoomCode: (code: string | null) => void;
  setWsRetryCount: (count: number) => void;
  setIceRestartCount: (count: number) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initial = {
  phase: "idle" as Phase,
  roomCode: null,
  wsRetryCount: 0,
  iceRestartCount: 0,
  error: null,
};

export const useConnectionStore = create<ConnectionStore>((set) => ({
  ...initial,
  setPhase: (phase) => set({ phase }),
  setRoomCode: (roomCode) => set({ roomCode }),
  setWsRetryCount: (wsRetryCount) => set({ wsRetryCount }),
  setIceRestartCount: (iceRestartCount) => set({ iceRestartCount }),
  setError: (error) => set({ error }),
  reset: () => set(initial),
}));
