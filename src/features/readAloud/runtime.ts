import { NativeSpeechProvider } from "./nativeSpeechProvider";
import { ReadAloudService } from "./readAloudService";
import { resolveEditorSpeechInput } from "./editorInput";
import { useReadAloudStore } from "./readAloudStore";
import type { ReadAloudScope } from "./extraction";

let service: ReadAloudService | null = null;

function getService(): ReadAloudService {
  service ??= new ReadAloudService(
    new NativeSpeechProvider(),
    resolveEditorSpeechInput,
    (state) => useReadAloudStore.getState().applyState(state),
  );
  return service;
}

export function startReadAloud(
  windowLabel: string,
  scope: ReadAloudScope,
): Promise<boolean> {
  return getService().start(windowLabel, scope);
}

export function stopReadAloud(): Promise<void> {
  return service?.stop() ?? Promise.resolve();
}

export function pauseReadAloud(): Promise<void> {
  return service?.pause() ?? Promise.resolve();
}

export function resumeReadAloud(): Promise<void> {
  return service?.resume() ?? Promise.resolve();
}
