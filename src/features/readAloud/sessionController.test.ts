// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  ReadAloudSessionController,
  SpeechPlaybackCancelledError,
  type SpeechPlaybackProvider,
} from "./sessionController";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function providerHarness() {
  const utterances: ReturnType<typeof deferred>[] = [];
  const provider: SpeechPlaybackProvider = {
    speak: vi.fn(() => {
      const utterance = deferred();
      utterances.push(utterance);
      return utterance.promise;
    }),
    stop: vi.fn(async () => undefined),
  };
  return { provider, utterances };
}

const segments = [
  { id: "s1", text: "One.", from: 0, to: 4 },
  { id: "s2", text: "Two.", from: 5, to: 9 },
];

describe("ReadAloudSessionController", () => {
  it("plays segments sequentially and reports progress", async () => {
    const { provider, utterances } = providerHarness();
    const states: string[] = [];
    const controller = new ReadAloudSessionController(provider, (state) => {
      states.push(`${state.status}:${state.index}`);
    });

    const run = controller.start({ tabId: "tab-1", segments });
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(1));
    utterances[0].resolve();
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(2));
    utterances[1].resolve();
    await run;

    expect(states).toContain("playing:0");
    expect(states).toContain("playing:1");
    expect(controller.getState()).toMatchObject({ status: "idle", index: 0 });
  });

  it("stops the provider and ignores a late completion", async () => {
    const { provider, utterances } = providerHarness();
    const controller = new ReadAloudSessionController(provider);

    const run = controller.start({ tabId: "tab-1", segments });
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(1));
    await controller.stop();
    utterances[0].resolve();
    await run;

    expect(provider.stop).toHaveBeenCalledTimes(1);
    expect(provider.speak).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("idle");
  });

  it("atomically replaces a running session", async () => {
    const { provider, utterances } = providerHarness();
    const controller = new ReadAloudSessionController(provider);

    const first = controller.start({ tabId: "old", segments });
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(1));
    const second = controller.start({
      tabId: "new",
      segments: [{ id: "new", text: "New.", from: 0, to: 4 }],
    });
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(2));

    utterances[0].resolve();
    utterances[1].resolve();
    await Promise.all([first, second]);

    expect(provider.stop).toHaveBeenCalledTimes(1);
    expect(controller.getState().status).toBe("idle");
  });

  it("surfaces provider errors without attempting the next segment", async () => {
    const { provider, utterances } = providerHarness();
    const controller = new ReadAloudSessionController(provider);

    const run = controller.start({ tabId: "tab-1", segments });
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(1));
    utterances[0].reject(new Error("engine unavailable"));
    await run;

    expect(provider.speak).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      status: "error",
      error: "engine unavailable",
    });
  });

  it("ends quietly when native playback is displaced by another window", async () => {
    const provider: SpeechPlaybackProvider = {
      speak: vi.fn(async () => {
        throw new SpeechPlaybackCancelledError();
      }),
      stop: vi.fn(async () => undefined),
    };
    const controller = new ReadAloudSessionController(provider);

    await controller.start({ tabId: "tab-1", segments });

    expect(provider.speak).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({ status: "idle", error: null });
  });

  it("preserves messages from structured native errors", async () => {
    const provider: SpeechPlaybackProvider = {
      speak: vi.fn(async () => {
        throw { code: "TTS_ENGINE_ERROR", message: "No speech engine" };
      }),
      stop: vi.fn(async () => undefined),
    };
    const controller = new ReadAloudSessionController(provider);
    await controller.start({ tabId: "tab-1", segments });
    expect(controller.getState()).toMatchObject({
      status: "error",
      error: "No speech engine",
    });
  });

  it("pauses by stopping the current sentence and resumes from that sentence", async () => {
    const { provider, utterances } = providerHarness();
    const controller = new ReadAloudSessionController(provider);

    const firstRun = controller.start({ tabId: "tab-1", segments });
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(1));
    await controller.pause();
    expect(controller.getState()).toMatchObject({ status: "paused", index: 0 });
    expect(provider.stop).toHaveBeenCalledTimes(1);
    utterances[0].resolve();
    await firstRun;

    const resumed = controller.resume();
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(2));
    expect(provider.speak).toHaveBeenNthCalledWith(2, "One.", undefined);
    utterances[1].resolve();
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(3));
    utterances[2].resolve();
    await resumed;

    expect(controller.getState().status).toBe("idle");
  });

  it("ignores pause and resume while idle", async () => {
    const { provider } = providerHarness();
    const controller = new ReadAloudSessionController(provider);
    await controller.pause();
    await controller.resume();
    expect(provider.stop).not.toHaveBeenCalled();
    expect(provider.speak).not.toHaveBeenCalled();
  });

  it("does not clear a newer session when an older stop completes late", async () => {
    const { provider, utterances } = providerHarness();
    const stopping = deferred();
    vi.mocked(provider.stop).mockImplementationOnce(() => stopping.promise);
    const controller = new ReadAloudSessionController(provider);
    const first = controller.start({ tabId: "old", segments });
    const stop = controller.stop();
    const second = controller.start({ tabId: "new", segments: segments.slice(0, 1) });
    await vi.waitFor(() => expect(provider.speak).toHaveBeenCalledTimes(2));

    stopping.resolve();
    await stop;
    expect(controller.getState()).toMatchObject({ status: "playing", tabId: "new" });

    utterances.forEach((utterance) => utterance.resolve());
    await Promise.all([first, second]);
  });
});
