import {
  onSpeechEvent,
  speak as nativeSpeak,
  stop as nativeStop,
  type SpeechEvent,
  type SpeechEventType,
  type SpeakOptions,
} from "tauri-plugin-tts-api";
import {
  SpeechPlaybackCancelledError,
  type SpeechPlaybackOptions,
  type SpeechPlaybackProvider,
} from "./sessionController";

export type NativeSpeechEvent = SpeechEvent;

export interface NativeTtsApi {
  speak(options: SpeakOptions): Promise<void>;
  stop(): Promise<void>;
  onSpeechEvent(
    type: SpeechEventType,
    callback: (event: NativeSpeechEvent) => void,
  ): Promise<() => void>;
}

const defaultApi: NativeTtsApi = {
  speak: nativeSpeak,
  stop: nativeStop,
  onSpeechEvent,
};

interface PendingSpeech {
  id?: string;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

function pendingSpeech(): PendingSpeech {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** Converts the native plugin's event-based lifecycle into one awaitable utterance. */
export class NativeSpeechProvider implements SpeechPlaybackProvider {
  private pending: PendingSpeech | null = null;
  private readonly listenersReady: Promise<void>;

  constructor(private readonly api: NativeTtsApi = defaultApi) {
    this.listenersReady = this.registerListeners();
  }

  private async registerListeners(): Promise<void> {
    await Promise.all([
      this.api.onSpeechEvent("speech:start", (event) => {
        if (this.pending && event.id) this.pending.id = event.id;
      }),
      this.api.onSpeechEvent("speech:finish", (event) => this.finish(event)),
      this.api.onSpeechEvent("speech:cancel", (event) => this.cancel(event)),
      this.api.onSpeechEvent("speech:error", (event) => this.fail(event, event.error)),
      this.api.onSpeechEvent("speech:interrupted", (event) =>
        this.fail(event, event.error ?? event.reason),
      ),
    ]);
  }

  private eventBelongsToPending(event: NativeSpeechEvent): boolean {
    return !event.id || this.pending?.id === event.id;
  }

  private finish(event: NativeSpeechEvent): void {
    if (!this.eventBelongsToPending(event)) return;
    const pending = this.pending;
    this.pending = null;
    pending?.resolve();
  }

  private fail(event: NativeSpeechEvent, message?: string): void {
    if (!this.eventBelongsToPending(event)) return;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new Error(message || "Native speech playback failed"));
  }

  private cancel(event: NativeSpeechEvent): void {
    if (!this.eventBelongsToPending(event)) return;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(new SpeechPlaybackCancelledError());
  }

  async speak(text: string, options: SpeechPlaybackOptions = {}): Promise<void> {
    if (this.pending) throw new Error("A native speech utterance is already active");
    await this.listenersReady;
    if (this.pending) throw new Error("A native speech utterance is already active");

    const pending = pendingSpeech();
    this.pending = pending;
    try {
      await this.api.speak({
        text,
        voiceId: options.voiceId ?? null,
        language: options.language ?? null,
        rate: options.rate ?? null,
        pitch: options.pitch ?? null,
        volume: options.volume ?? null,
        queueMode: "flush",
      });
    } catch (error) {
      if (this.pending === pending) this.pending = null;
      throw error;
    }
    return pending.promise;
  }

  async stop(): Promise<void> {
    const pending = this.pending;
    try {
      await this.api.stop();
    } finally {
      if (this.pending === pending) this.pending = null;
      pending?.resolve();
    }
  }
}
