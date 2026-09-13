import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReadAloudStore } from "@/features/readAloud/readAloudStore";

const { pauseReadAloud, resumeReadAloud, stopReadAloud } = vi.hoisted(() => ({
  pauseReadAloud: vi.fn(async () => undefined),
  resumeReadAloud: vi.fn(async () => undefined),
  stopReadAloud: vi.fn(async () => undefined),
}));
vi.mock("@/features/readAloud/runtime", () => ({
  pauseReadAloud,
  resumeReadAloud,
  stopReadAloud,
}));

import { ReadAloudIndicator } from "./ReadAloudIndicator";

beforeEach(() => {
  stopReadAloud.mockClear();
  pauseReadAloud.mockClear();
  resumeReadAloud.mockClear();
  useReadAloudStore.setState({
    status: "idle",
    sessionId: null,
    tabId: null,
    index: 0,
    total: 0,
    current: null,
    error: null,
  });
});

describe("ReadAloudIndicator", () => {
  it("stays absent while idle", () => {
    const { container } = render(<ReadAloudIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it("announces progress and offers an accessible stop button", () => {
    useReadAloudStore.setState({
      status: "playing",
      sessionId: "session-1",
      tabId: "tab-1",
      index: 1,
      total: 3,
      current: { id: "s2", text: "Two", from: 4, to: 7 },
      error: null,
    });
    render(<ReadAloudIndicator />);

    expect(screen.getByRole("status")).toHaveTextContent("2/3");
    fireEvent.click(document.querySelector(".status-read-aloud__pause")!);
    expect(pauseReadAloud).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector(".status-read-aloud__stop")!);
    expect(stopReadAloud).toHaveBeenCalledTimes(1);
  });

  it("resumes a paused sentence", () => {
    useReadAloudStore.setState({
      status: "paused",
      sessionId: "session-1",
      tabId: "tab-1",
      index: 0,
      total: 2,
      current: { id: "s1", text: "One", from: 0, to: 3 },
      error: null,
    });
    render(<ReadAloudIndicator />);
    fireEvent.click(document.querySelector(".status-read-aloud__pause")!);
    expect(resumeReadAloud).toHaveBeenCalledTimes(1);
  });

  it("shows provider failures without leaking an empty progress count", () => {
    useReadAloudStore.setState({
      status: "error",
      sessionId: "session-1",
      tabId: "tab-1",
      index: 0,
      total: 1,
      current: null,
      error: "voice unavailable",
    });
    render(<ReadAloudIndicator />);

    expect(screen.getByRole("status")).toHaveAttribute("title", "voice unavailable");
    expect(screen.getByRole("status")).not.toHaveTextContent("0/0");
  });
});
