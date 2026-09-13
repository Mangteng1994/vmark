import type { ReadAloudState, SpeechSegment } from "./types";

export interface SpeechPlaybackOptions {
  voiceId?: string;
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

export interface SpeechPlaybackProvider {
  /** Resolves when the utterance finishes, rejects on synthesis/playback failure. */
  speak(text: string, options?: SpeechPlaybackOptions): Promise<void>;
  stop(): Promise<void>;
}

/** Control-flow signal emitted when native playback is displaced externally. */
export class SpeechPlaybackCancelledError extends Error {
  constructor() {
    super("Native speech playback was cancelled");
    this.name = "SpeechPlaybackCancelledError";
  }
}

interface StartRequest {
  tabId: string;
  segments: readonly SpeechSegment[];
  options?: SpeechPlaybackOptions;
}

const IDLE_STATE: ReadAloudState = {
  status: "idle",
  sessionId: null,
  tabId: null,
  index: 0,
  total: 0,
  current: null,
  error: null,
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}

/** Owns one application read-aloud queue and rejects stale async completions. */
export class ReadAloudSessionController {
  private generation = 0;
  private state: ReadAloudState = IDLE_STATE;
  private activeRequest: StartRequest | null = null;

  constructor(
    private readonly provider: SpeechPlaybackProvider,
    private readonly onStateChange: (state: ReadAloudState) => void = () => undefined,
  ) {}

  getState(): ReadAloudState {
    return this.state;
  }

  private publish(state: ReadAloudState): void {
    this.state = state;
    this.onStateChange(state);
  }

  async start(request: StartRequest): Promise<void> {
    const replacing = this.state.status !== "idle" && this.state.status !== "error";
    const generation = ++this.generation;
    if (replacing) await this.provider.stop();
    if (generation !== this.generation) return;

    if (request.segments.length === 0) {
      this.activeRequest = null;
      this.publish(IDLE_STATE);
      return;
    }

    const sessionId = globalThis.crypto?.randomUUID?.() ?? `speech-${generation}`;
    this.activeRequest = request;
    this.publish({
      status: "preparing",
      sessionId,
      tabId: request.tabId,
      index: 0,
      total: request.segments.length,
      current: request.segments[0] ?? null,
      error: null,
    });

    await this.play(request, 0, generation);
  }

  private async play(request: StartRequest, startIndex: number, generation: number): Promise<void> {
    for (let index = startIndex; index < request.segments.length; index += 1) {
      if (generation !== this.generation) return;
      const current = request.segments[index];
      this.publish({ ...this.state, status: "playing", index, current });
      try {
        await this.provider.speak(current.text, request.options);
      } catch (error) {
        if (generation !== this.generation) return;
        this.activeRequest = null;
        if (error instanceof SpeechPlaybackCancelledError) {
          this.publish(IDLE_STATE);
          return;
        }
        this.publish({ ...this.state, status: "error", error: errorMessage(error) });
        return;
      }
    }

    if (generation === this.generation) {
      this.activeRequest = null;
      this.publish(IDLE_STATE);
    }
  }

  async pause(): Promise<void> {
    if (this.state.status !== "playing" && this.state.status !== "preparing") return;
    const generation = ++this.generation;
    this.publish({ ...this.state, status: "paused" });
    try {
      await this.provider.stop();
    } catch (error) {
      if (generation !== this.generation) return;
      this.activeRequest = null;
      this.publish({ ...this.state, status: "error", error: errorMessage(error) });
    }
  }

  async resume(): Promise<void> {
    const request = this.activeRequest;
    if (this.state.status !== "paused" || !request) return;
    const generation = ++this.generation;
    this.publish({ ...this.state, status: "playing", error: null });
    await this.play(request, this.state.index, generation);
  }

  async stop(): Promise<void> {
    const wasActive = this.state.status !== "idle";
    const generation = ++this.generation;
    if (!wasActive) return;
    this.activeRequest = null;
    this.publish({ ...this.state, status: "stopping" });
    try {
      await this.provider.stop();
    } finally {
      if (generation === this.generation) this.publish(IDLE_STATE);
    }
  }
}
