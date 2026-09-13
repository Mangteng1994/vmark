// @vitest-environment node

import { EditorState as SourceState } from "@codemirror/state";
import StarterKit from "@tiptap/starter-kit";
import { getSchema } from "@tiptap/core";
import { EditorState as WysiwygState, TextSelection } from "@tiptap/pm/state";
import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editorStore";
import { useTabStore } from "@/stores/tabStore";
import { useUIStore } from "@/stores/uiStore";
import { resolveEditorSpeechInput } from "./editorInput";

function seedDocument(tabId: string): void {
  useTabStore.setState({
    tabs: {
      main: [
        {
          id: tabId,
          kind: "document",
          title: "Doc",
          filePath: null,
          formatId: "markdown",
          isPinned: false,
        },
      ],
    },
    activeTabId: { main: tabId },
  });
}

beforeEach(() => {
  useTabStore.setState({ tabs: {}, activeTabId: {} });
  useEditorStore.getState().clearActiveEditors();
  useUIStore.setState({ sourceMode: false });
});

describe("resolveEditorSpeechInput", () => {
  it("returns null without an active document", () => {
    expect(resolveEditorSpeechInput("main", "document")).toBeNull();
  });

  it("extracts from the active source editor", () => {
    seedDocument("tab-1");
    const state = SourceState.create({
      doc: "Alpha\n中文行",
      selection: { anchor: 6, head: 9 },
    });
    useUIStore.setState({ sourceMode: true });
    useEditorStore.getState().setActiveSourceView({ state } as never, "tab-1");

    expect(resolveEditorSpeechInput("main", "selection")).toEqual({
      tabId: "tab-1",
      ranges: [{ text: "中文行", from: 6, to: 9 }],
    });
  });

  it("extracts from the active WYSIWYG editor", () => {
    seedDocument("tab-1");
    const schema = getSchema([StarterKit]);
    const doc = schema.node("doc", null, schema.node("paragraph", null, schema.text("Hello")));
    const state = WysiwygState.create({
      doc,
      selection: TextSelection.create(doc, 1, 6),
    });
    useEditorStore.getState().setActiveWysiwygEditor({ state, isDestroyed: false } as never, "tab-1");

    expect(resolveEditorSpeechInput("main", "selection")).toEqual({
      tabId: "tab-1",
      ranges: [{ text: "Hello", from: 1, to: 6 }],
    });
  });

  it("rejects an editor still bound to a stale tab", () => {
    seedDocument("tab-current");
    const state = SourceState.create({ doc: "wrong document" });
    useUIStore.setState({ sourceMode: true });
    useEditorStore.getState().setActiveSourceView({ state } as never, "tab-old");

    expect(resolveEditorSpeechInput("main", "document")).toBeNull();
  });

  it("rejects a destroyed WYSIWYG editor", () => {
    seedDocument("tab-1");
    useEditorStore
      .getState()
      .setActiveWysiwygEditor({ isDestroyed: true, state: {} } as never, "tab-1");
    expect(resolveEditorSpeechInput("main", "document")).toBeNull();
  });
});
