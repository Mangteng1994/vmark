// @vitest-environment node

import { EditorSelection, EditorState as SourceState } from "@codemirror/state";
import StarterKit from "@tiptap/starter-kit";
import { getSchema } from "@tiptap/core";
import { EditorState as WysiwygState, TextSelection } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { extractSourceText, extractWysiwygText } from "./extraction";

describe("extractSourceText", () => {
  const text = "第一行\nSecond line\n最后一行";

  it("extracts every non-empty selection without merging gaps", () => {
    const state = SourceState.create({
      doc: text,
      selection: EditorSelection.create([
        EditorSelection.range(0, 3),
        EditorSelection.range(4, 10),
      ]),
      extensions: [EditorStateAllowMultipleSelections.of(true)],
    });

    expect(extractSourceText(state, "selection")).toEqual([
      { text: "第一行", from: 0, to: 3 },
      { text: "Second", from: 4, to: 10 },
    ]);
  });

  it("returns no selection for a caret", () => {
    const state = SourceState.create({ doc: text, selection: { anchor: 2 } });
    expect(extractSourceText(state, "selection")).toEqual([]);
  });

  it("extracts the current line, from caret, and whole document", () => {
    const state = SourceState.create({ doc: text, selection: { anchor: 6 } });

    expect(extractSourceText(state, "block")).toEqual([
      { text: "Second line", from: 4, to: 15 },
    ]);
    expect(extractSourceText(state, "fromCursor")).toEqual([
      { text: "cond line\n最后一行", from: 6, to: text.length },
    ]);
    expect(extractSourceText(state, "document")).toEqual([
      { text, from: 0, to: text.length },
    ]);
  });
});

const EditorStateAllowMultipleSelections = SourceState.allowMultipleSelections;

describe("extractWysiwygText", () => {
  const schema = getSchema([StarterKit]);
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, schema.text("Alpha")),
    schema.node("paragraph", null, schema.text("中文 Beta")),
  ]);

  it("extracts an explicit selection", () => {
    const state = WysiwygState.create({
      doc,
      selection: TextSelection.create(doc, 1, 6),
    });
    expect(extractWysiwygText(state, "selection")).toEqual([
      { text: "Alpha", from: 1, to: 6 },
    ]);
  });

  it("returns no selection for a caret", () => {
    const state = WysiwygState.create({
      doc,
      selection: TextSelection.create(doc, 2),
    });
    expect(extractWysiwygText(state, "selection")).toEqual([]);
  });

  it("extracts the nearest text block at the caret", () => {
    const state = WysiwygState.create({
      doc,
      selection: TextSelection.create(doc, 10),
    });
    expect(extractWysiwygText(state, "block")).toEqual([
      { text: "中文 Beta", from: 8, to: 15 },
    ]);
  });

  it("extracts from the caret and separates blocks for speech", () => {
    const state = WysiwygState.create({
      doc,
      selection: TextSelection.create(doc, 3),
    });
    expect(extractWysiwygText(state, "fromCursor")).toEqual([
      { text: "pha\n中文 Beta", from: 3, to: doc.content.size },
    ]);
    expect(extractWysiwygText(state, "document")).toEqual([
      { text: "Alpha\n中文 Beta", from: 0, to: doc.content.size },
    ]);
  });
});
