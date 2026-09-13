import { buildSpeechSegments } from "./segmenter";
import {
  ReadAloudSessionController,
  type SpeechPlaybackOptions,
  type SpeechPlaybackProvider,
} from "./sessionController";
import type { ReadAloudScope, SpeechTextRange } from "./extraction";
import type { ReadAloudState, SpeechSegment } from "./types";
import { useSettingsStore } from "@/stores/settingsStore";

export interface ReadAloudInput {
  tabId: string;
  ranges: readonly SpeechTextRange[];
}

export type ReadAloudInputResolver = (
  windowLabel: string,
  scope: ReadAloudScope,
) => ReadAloudInput | null;

function segmentRanges(ranges: readonly SpeechTextRange[]): SpeechSegment[] {
  let nextId = 0;
  return ranges.flatMap((range) =>
    buildSpeechSegments(range.text).map((segment) => ({
      ...segment,
      id: `speech-${nextId++}`,
      from: range.from + segment.from,
      to: range.from + segment.to,
    })),
  );
}

/** Application-level orchestration independent from editor and native API details. */
export class ReadAloudService {
  private readonly controller: ReadAloudSessionController;

  constructor(
    provider: SpeechPlaybackProvider,
    private readonly resolveInput: ReadAloudInputResolver,
    onStateChange?: (state: ReadAloudState) => void,
  ) {
    this.controller = new ReadAloudSessionController(provider, onStateChange);
  }

  getState(): ReadAloudState {
    return this.controller.getState();
  }

  async start(
    windowLabel: string,
    scope: ReadAloudScope,
    options?: SpeechPlaybackOptions,
  ): Promise<boolean> {
    if (!useSettingsStore.getState().speech.enabled) return false;
    const input = this.resolveInput(windowLabel, scope);
    if (!input) return false;
    const segments = segmentRanges(input.ranges);
    if (segments.length === 0) return false;
    await this.controller.start({
      tabId: input.tabId,
      segments,
      ...(options ? { options } : {}),
    });
    return true;
  }

  stop(): Promise<void> {
    return this.controller.stop();
  }

  pause(): Promise<void> {
    return this.controller.pause();
  }

  resume(): Promise<void> {
    return this.controller.resume();
  }
}
