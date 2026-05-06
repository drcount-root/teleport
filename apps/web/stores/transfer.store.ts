import { create } from "zustand";
import type { TransferItem } from "@repo/shared";

interface TransferStore {
  queue: TransferItem[];
  direction: "send" | "receive" | null;
  isPaused: boolean;
  addItem: (item: TransferItem) => void;
  updateItem: (fileId: string, update: Partial<TransferItem>) => void;
  removeItem: (fileId: string) => void;
  setDirection: (direction: "send" | "receive" | null) => void;
  setIsPaused: (isPaused: boolean) => void;
  reset: () => void;
}

export const useTransferStore = create<TransferStore>((set, get) => ({
  queue: [],
  direction: null,
  isPaused: false,
  addItem: (item) => set({ queue: [...get().queue, item] }),
  updateItem: (fileId, update) =>
    set({
      queue: get().queue.map((it) =>
        it.fileId === fileId ? { ...it, ...update } : it,
      ),
    }),
  removeItem: (fileId) =>
    set({ queue: get().queue.filter((it) => it.fileId !== fileId) }),
  setDirection: (direction) => set({ direction }),
  setIsPaused: (isPaused) => set({ isPaused }),
  reset: () => set({ queue: [], direction: null, isPaused: false }),
}));
