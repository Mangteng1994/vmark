import type { EditorState as SourceState } from "@codemirror/state";
import type { EditorState as WysiwygState } from "@tiptap/pm/state";

export type ReadAloudScope = "selection" | "block" | "fromCursor" | "document";

export interface SpeechTextRange {
  text: string;
  from: number;
  to: number;
}

function sourceRange(state: SourceState, from: number, to: number): SpeechTextRange[] {
  if (from === to) return [];
  return [{ text: state.doc.sliceString(from, to), from, to }];
}

export function extractSourceText(
  state: SourceState,
  scope: ReadAloudScope,
): SpeechTextRange[] {
  const { main } = state.selection;
  switch (scope) {
    case "selection":
      return state.selection.ranges.flatMap(({ from, to }) => sourceRange(state, from, to));
    case "block": {
      const line = state.doc.lineAt(main.head);
      return sourceRange(state, line.from, line.to);
    }
    case "fromCursor":
      return sourceRange(state, main.head, state.doc.length);
    case "document":
      return sourceRange(state, 0, state.doc.length);
  }
}

function wysiwygRange(
  state: WysiwygState,
  from: number,
  to: number,
): SpeechTextRange[] {
  if (from === to) return [];
  return [{ text: state.doc.textBetween(from, to, "\n", " "), from, to }];
}

export function extractWysiwygText(
  state: WysiwygState,
  scope: ReadAloudScope,
): SpeechTextRange[] {
  const { selection } = state;
  switch (scope) {
    case "selection":
      return selection.empty ? [] : wysiwygRange(state, selection.from, selection.to);
    case "block": {
      const { $head } = selection;
      for (let depth = $head.depth; depth > 0; depth -= 1) {
        if ($head.node(depth).isTextblock) {
          return wysiwygRange(state, $head.start(depth), $head.end(depth));
        }
      }
      return [];
    }
    case "fromCursor":
      return wysiwygRange(state, selection.head, state.doc.content.size);
    case "document":
      return wysiwygRange(state, 0, state.doc.content.size);
  }
}
