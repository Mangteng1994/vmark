// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  NativeSpeechProvider,
  type NativeSpeechEvent,
  type NativeTtsApi,
} from "./nativeSpeechProvider";
import { SpeechPlaybackCancelledError } from "./sessionController";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function apiHarness() {
  const listeners = new Map<string, (event: NativeSpeechEvent) => void>();
  const started = deferred();
  const api: NativeTtsApi = {
    speak: vi.fn(() => started.promise),
    stop: vi.fn(async () => undefined),
    onSpeechEvent: vi.fn(async (type, callback) => {
      listeners.set(type, callback);
      return vi.fn();
    }),
  };
  return { api, listeners, started };
}

describe("NativeSpeechProvider", () => {
  it("waits for finish instead of resolving when native playback starts", async () => {
    const { api, listeners, started } = apiHarness();
    const provider = new NativeSpeechProvider(api);
    let settled = false;

    const speech = provider
      .speak("你好", { voiceId: "voice-1", language: "zh-CN", rate: 1.2 })
      .then(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(api.speak).toHaveBeenCalledTimes(1));
    expect(api.speak).toHaveBeenCalledWith({
      text: "你好",
      voiceId: "voice-1",
      language: "zh-CN",
      rate: 1.2,
      pitch: null,
      volume: null,
      queueMode: "flush",
    });
    started.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    listeners.get("speech:finish")?.({});
    await speech;
    expect(settled).toBe(true);
  });

  it("terminates the queue when another native utterance cancels this one", async () => {
    const { api, listeners, started } = apiHarness();
    const provider = new NativeSpeechProvider(api);
    const speech = provider.speak("text");
    await vi.waitFor(() => expect(api.speak).toHaveBeenCalledTimes(1));
    started.resolve();
    listeners.get("speech:cancel")?.({ interrupted: true });
    await expect(speech).rejects.toBeInstanceOf(SpeechPlaybackCancelledError);
  });

  it("surfaces native speech errors with their message", async () => {
    const { api, listeners, started } = apiHarness();
    const provider = new NativeSpeechProvider(api);
    const speech = provider.speak("text");
    await vi.waitFor(() => expect(api.speak).toHaveBeenCalledTimes(1));
    started.resolve();
    listeners.get("speech:error")?.({ error: "voice unavailable" });
    await expect(speech).rejects.toThrow("voice unavailable");
  });

  it("settles pending speech even if stop emits no cancellation event", async () => {
    const { api, started } = apiHarness();
    const provider = new NativeSpeechProvider(api);
    const speech = provider.speak("text");
    await vi.waitFor(() => expect(api.speak).toHaveBeenCalledTimes(1));
    started.resolve();

    await provider.stop();
    await expect(speech).resolves.toBeUndefined();
    expect(api.stop).toHaveBeenCalledTimes(1);
  });

  it("rejects an overlapping direct provider call", async () => {
    const { api } = apiHarness();
    const provider = new NativeSpeechProvider(api);
    void provider.speak("first");
    await vi.waitFor(() => expect(api.speak).toHaveBeenCalledTimes(1));

    await expect(provider.speak("second")).rejects.toThrow("already active");
  });

  it("ignores broadcast events belonging to another window utterance", async () => {
    const { api, listeners, started } = apiHarness();
    const provider = new NativeSpeechProvider(api);
    let settled = false;
    const speech = provider.speak("new window speech").then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(api.speak).toHaveBeenCalledTimes(1));

    listeners.get("speech:cancel")?.({ id: "old-window" });
    listeners.get("speech:start")?.({ id: "this-window" });
    started.resolve();
    listeners.get("speech:finish")?.({ id: "other-window" });
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    expect(settled).toBe(false);

    listeners.get("speech:finish")?.({ id: "this-window" });
    await speech;
    expect(settled).toBe(true);
  });
});
