export interface SpeechSegment {
  id: string;
  text: string;
  from: number;
  to: number;
}

type ReadAloudStatus =
  | "idle"
  | "preparing"
  | "playing"
  | "paused"
  | "stopping"
  | "error";

export interface ReadAloudState {
  status: ReadAloudStatus;
  sessionId: string | null;
  tabId: string | null;
  index: number;
  total: number;
  current: SpeechSegment | null;
  error: string | null;
}
