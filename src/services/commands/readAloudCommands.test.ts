// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetCommandBus,
  executeCommand,
  hasCommand,
} from "./CommandBus";
import {
  registerReadAloudCommands,
  type ReadAloudCommandActions,
} from "./readAloudCommands";

function context(overrides: Record<string, unknown> = {}) {
  return {
    windowLabel: "doc-1",
    isDocument: true,
    editorAvailable: true,
    hasSelection: true,
    ...overrides,
  };
}

let actions: ReadAloudCommandActions;

beforeEach(() => {
  _resetCommandBus();
  actions = {
    start: vi.fn(async () => true),
    stop: vi.fn(async () => undefined),
  };
  registerReadAloudCommands(actions);
});

describe("read-aloud commands", () => {
  it("registers the built-in reading scopes and stop", () => {
    expect(hasCommand("speech.readSelection")).toBe(true);
    expect(hasCommand("speech.readBlock")).toBe(true);
    expect(hasCommand("speech.readFromCursor")).toBe(true);
    expect(hasCommand("speech.readDocument")).toBe(true);
    expect(hasCommand("speech.stop")).toBe(true);
  });

  it("replaces the owned command batch on re-bootstrap", async () => {
    const replacement: ReadAloudCommandActions = {
      start: vi.fn(async () => true),
      stop: vi.fn(async () => undefined),
    };

    registerReadAloudCommands(replacement);
    await executeCommand("speech.readDocument", undefined, context());

    expect(actions.start).not.toHaveBeenCalled();
    expect(replacement.start).toHaveBeenCalledWith("doc-1", "document");
  });

  it("routes each scope with the invoking window label", async () => {
    await executeCommand("speech.readSelection", undefined, context());
    await executeCommand("speech.readBlock", undefined, context());
    await executeCommand("speech.readFromCursor", undefined, context());
    await executeCommand("speech.readDocument", undefined, context());

    expect(actions.start).toHaveBeenNthCalledWith(1, "doc-1", "selection");
    expect(actions.start).toHaveBeenNthCalledWith(2, "doc-1", "block");
    expect(actions.start).toHaveBeenNthCalledWith(3, "doc-1", "fromCursor");
    expect(actions.start).toHaveBeenNthCalledWith(4, "doc-1", "document");
  });

  it("hides selection speech for an empty selection", async () => {
    await expect(
      executeCommand("speech.readSelection", undefined, context({ hasSelection: false })),
    ).resolves.toBe(false);
    expect(actions.start).not.toHaveBeenCalled();
  });

  it("hides reading commands without a live document editor", async () => {
    await expect(
      executeCommand("speech.readDocument", undefined, context({ editorAvailable: false })),
    ).resolves.toBe(false);
    await expect(
      executeCommand("speech.readBlock", undefined, context({ isDocument: false })),
    ).resolves.toBe(false);
    expect(actions.start).not.toHaveBeenCalled();
  });

  it("stops independently of editor availability", async () => {
    await executeCommand("speech.stop", undefined, context({ editorAvailable: false }));
    expect(actions.stop).toHaveBeenCalledTimes(1);
  });
});
