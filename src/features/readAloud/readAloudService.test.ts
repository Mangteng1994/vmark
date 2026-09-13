// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import type { SpeechPlaybackProvider } from "./sessionController";
import { ReadAloudService, type ReadAloudInputResolver } from "./readAloudService";
import { useSettingsStore } from "@/stores/settingsStore";

function createHarness(input: ReturnType<ReadAloudInputResolver>) {
  const provider: SpeechPlaybackProvider = {
    speak: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };
  const resolver: ReadAloudInputResolver = vi.fn(() => input);
  return { provider, resolver, service: new ReadAloudService(provider, resolver) };
}

describe("ReadAloudService", () => {
  it("does not start when read aloud is disabled in integrations settings", async () => {
    useSettingsStore.setState({ speech: { enabled: false } });
    const { provider, service } = createHarness({ tabId: "tab-1", ranges: [{ text: "Hello.", from: 0, to: 6 }] });
    await expect(service.start("main", "document")).resolves.toBe(false);
    expect(provider.speak).not.toHaveBeenCalled();
    useSettingsStore.setState({ speech: { enabled: true } });
  });
  it("does not start playback without an active readable range", async () => {
    const { provider, service } = createHarness(null);
    await expect(service.start("main", "selection")).resolves.toBe(false);
    expect(provider.speak).not.toHaveBeenCalled();
  });

  it("filters whitespace-only and punctuation-only ranges", async () => {
    const { provider, service } = createHarness({
      tabId: "tab-1",
      ranges: [
        { text: "  ", from: 0, to: 2 },
        { text: "……！？", from: 3, to: 7 },
      ],
    });
    await expect(service.start("main", "document")).resolves.toBe(false);
    expect(provider.speak).not.toHaveBeenCalled();
  });

  it("segments multiple ranges and plays them in reading order", async () => {
    const { provider, resolver, service } = createHarness({
      tabId: "tab-1",
      ranges: [
        { text: "第一句。第二句！", from: 10, to: 18 },
        { text: "Last.", from: 30, to: 35 },
      ],
    });

    await expect(service.start("doc-window", "selection", { rate: 1.25 })).resolves.toBe(true);

    expect(resolver).toHaveBeenCalledWith("doc-window", "selection");
    expect(provider.speak).toHaveBeenNthCalledWith(1, "第一句。", { rate: 1.25 });
    expect(provider.speak).toHaveBeenNthCalledWith(2, "第二句！", { rate: 1.25 });
    expect(provider.speak).toHaveBeenNthCalledWith(3, "Last.", { rate: 1.25 });
  });

  it("exposes stop without resolving editor input again", async () => {
    const { provider, resolver, service } = createHarness(null);
    await service.stop();
    expect(provider.stop).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
  });
});
