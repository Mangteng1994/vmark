import { useEditorStore } from "@/stores/editorStore";
import { useTabStore } from "@/stores/tabStore";
import { isEffectiveSourceMode } from "@/services/editor/editorActionGates";
import { extractSourceText, extractWysiwygText, type ReadAloudScope } from "./extraction";
import type { ReadAloudInput } from "./readAloudService";

/** Resolve only the live editor belonging to the active document in this window. */
export function resolveEditorSpeechInput(
  windowLabel: string,
  scope: ReadAloudScope,
): ReadAloudInput | null {
  const tabStore = useTabStore.getState();
  const tabId = tabStore.activeTabId[windowLabel] ?? null;
  const tab = tabId ? tabStore.findTabById(tabId) : null;
  if (!tabId || tab?.kind !== "document") return null;

  const { active } = useEditorStore.getState();
  if (isEffectiveSourceMode(windowLabel)) {
    const view = active.activeSourceView;
    if (!view || active.activeSourceTabId !== tabId) return null;
    return { tabId, ranges: extractSourceText(view.state, scope) };
  }

  const editor = active.activeWysiwygEditor;
  if (!editor || editor.isDestroyed || active.activeWysiwygTabId !== tabId) return null;
  return { tabId, ranges: extractWysiwygText(editor.state, scope) };
}
