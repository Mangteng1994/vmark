import { create } from "zustand";
import type { ReadAloudState } from "./types";

interface ReadAloudStore extends ReadAloudState {
  applyState: (state: ReadAloudState) => void;
}

export const useReadAloudStore = create<ReadAloudStore>((set) => ({
  status: "idle",
  sessionId: null,
  tabId: null,
  index: 0,
  total: 0,
  current: null,
  error: null,
  applyState: (state) => set(state),
}));
