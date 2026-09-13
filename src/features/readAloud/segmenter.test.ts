// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSpeechSegments } from "./segmenter";

afterEach(() => vi.unstubAllGlobals());

describe("buildSpeechSegments", () => {
  it("returns no segments for empty, whitespace-only, or punctuation-only input", () => {
    expect(buildSpeechSegments("", { locale: "zh-CN" })).toEqual([]);
    expect(buildSpeechSegments(" \n\t ", { locale: "zh-CN" })).toEqual([]);
    expect(buildSpeechSegments("……！？", { locale: "zh-CN" })).toEqual([]);
  });

  it("splits mixed CJK and Latin prose at sentence boundaries", () => {
    const segments = buildSpeechSegments(
      "第一句。第二句！ Hello world. Last one?",
      { locale: "zh-CN" },
    );

    expect(segments.map((segment) => segment.text)).toEqual([
      "第一句。",
      "第二句！",
      "Hello world.",
      "Last one?",
    ]);
  });

  it("preserves source offsets after trimming surrounding whitespace", () => {
    const input = "  Alpha.\n\n  Beta。  ";
    const segments = buildSpeechSegments(input, { locale: "en" });

    expect(segments).toMatchObject([
      { text: "Alpha.", from: 2, to: 8 },
      { text: "Beta。", from: 12, to: 17 },
    ]);
    expect(input.slice(segments[1].from, segments[1].to)).toBe("Beta。");
  });

  it("never cuts an emoji grapheme while enforcing the UTF-8 byte limit", () => {
    const input = "你好👩🏽‍💻世界".repeat(20);
    const segments = buildSpeechSegments(input, {
      locale: "zh-CN",
      maxBytes: 48,
    });

    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((segment) => new TextEncoder().encode(segment.text).length <= 48)).toBe(true);
    expect(segments.map((segment) => segment.text).join("")).toBe(input);
    expect(segments.every((segment) => !segment.text.includes("�"))).toBe(true);
  });

  it("keeps decimals together in the fallback segmenter", () => {
    const segments = buildSpeechSegments("Version 1.25 is ready. Next.", {
      locale: "en",
      forceFallback: true,
    });

    expect(segments.map((segment) => segment.text)).toEqual([
      "Version 1.25 is ready.",
      "Next.",
    ]);
  });

  it("keeps joined emoji intact when Intl.Segmenter is unavailable", () => {
    vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
    const segments = buildSpeechSegments("A👩🏽‍💻B", {
      maxBytes: 15,
      forceFallback: true,
    });

    expect(segments.map((segment) => segment.text)).toEqual(["A", "👩🏽‍💻", "B"]);
  });
});
