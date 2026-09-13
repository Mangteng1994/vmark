import type { SpeechSegment } from "./types";

const DEFAULT_MAX_BYTES = 2_400;
const READABLE_CHARACTER = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;
const SENTENCE_END = /[。！？!?；;]/u;
const MARK = /\p{Mark}/u;
const EMOJI_MODIFIER = /\p{Emoji_Modifier}/u;
const VARIATION_SELECTOR = /[\uFE00-\uFE0F]/u;
const SUPPLEMENTARY_VARIATION_SELECTOR = /[\u{E0100}-\u{E01EF}]/u;
const encoder = new TextEncoder();

interface SegmentOptions {
  locale?: string;
  maxBytes?: number;
  /** Deterministic seam for testing runtimes without Intl.Segmenter. */
  forceFallback?: boolean;
}

interface TextRange {
  from: number;
  to: number;
}

function trimRange(input: string, range: TextRange): TextRange | null {
  let { from, to } = range;
  while (from < to && /\s/u.test(input[from])) from += 1;
  while (to > from && /\s/u.test(input[to - 1])) to -= 1;
  return from < to ? { from, to } : null;
}

function fallbackSentences(input: string): TextRange[] {
  const ranges: TextRange[] = [];
  let start = 0;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const decimalPoint =
      char === "." && /\d/u.test(input[index - 1] ?? "") && /\d/u.test(input[index + 1] ?? "");
    if (decimalPoint || !(char === "." || SENTENCE_END.test(char))) continue;
    let end = index + 1;
    while (end < input.length && (SENTENCE_END.test(input[end]) || input[end] === ".")) end += 1;
    ranges.push({ from: start, to: end });
    start = end;
  }
  if (start < input.length) ranges.push({ from: start, to: input.length });
  return ranges;
}

function sentenceRanges(input: string, options: SegmentOptions): TextRange[] {
  if (!options.forceFallback && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(options.locale, { granularity: "sentence" });
    return [...segmenter.segment(input)].map(({ index, segment }) => ({
      from: index,
      to: index + segment.length,
    }));
  }
  return fallbackSentences(input);
}

function graphemeRanges(input: string, range: TextRange, locale?: string): TextRange[] {
  if (typeof Intl.Segmenter !== "function") {
    const ranges: TextRange[] = [];
    let cursor = range.from;
    while (cursor < range.to) {
      const from = cursor;
      const first = String.fromCodePoint(input.codePointAt(cursor)!);
      cursor += first.length;

      // Regional indicators form flag pairs.
      if (/\p{Regional_Indicator}/u.test(first) && cursor < range.to) {
        const next = String.fromCodePoint(input.codePointAt(cursor)!);
        if (/\p{Regional_Indicator}/u.test(next)) cursor += next.length;
      }

      while (cursor < range.to) {
        const next = String.fromCodePoint(input.codePointAt(cursor)!);
        if (
          MARK.test(next) ||
          EMOJI_MODIFIER.test(next) ||
          VARIATION_SELECTOR.test(next) ||
          SUPPLEMENTARY_VARIATION_SELECTOR.test(next)
        ) {
          cursor += next.length;
          continue;
        }
        if (next === "\u200D") {
          cursor += next.length;
          if (cursor < range.to) {
            cursor += String.fromCodePoint(input.codePointAt(cursor)!).length;
          }
          continue;
        }
        break;
      }
      ranges.push({ from, to: cursor });
    }
    return ranges;
  }
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  return [...segmenter.segment(input.slice(range.from, range.to))].map(({ index, segment }) => ({
    from: range.from + index,
    to: range.from + index + segment.length,
  }));
}

function splitToByteLimit(
  input: string,
  range: TextRange,
  maxBytes: number,
  locale?: string,
): TextRange[] {
  if (encoder.encode(input.slice(range.from, range.to)).length <= maxBytes) return [range];
  const result: TextRange[] = [];
  let chunkStart = range.from;
  let chunkEnd = range.from;
  let bytes = 0;
  for (const grapheme of graphemeRanges(input, range, locale)) {
    const nextBytes = encoder.encode(input.slice(grapheme.from, grapheme.to)).length;
    if (bytes > 0 && bytes + nextBytes > maxBytes) {
      result.push({ from: chunkStart, to: chunkEnd });
      chunkStart = grapheme.from;
      bytes = 0;
    }
    chunkEnd = grapheme.to;
    bytes += nextBytes;
  }
  if (chunkEnd > chunkStart) result.push({ from: chunkStart, to: chunkEnd });
  return result;
}

/** Split readable text into offset-preserving, provider-safe utterances. */
export function buildSpeechSegments(
  input: string,
  options: SegmentOptions = {},
): SpeechSegment[] {
  const maxBytes = Math.max(4, options.maxBytes ?? DEFAULT_MAX_BYTES);
  const ranges = sentenceRanges(input, options)
    .map((range) => trimRange(input, range))
    .filter((range): range is TextRange => range !== null)
    .flatMap((range) => splitToByteLimit(input, range, maxBytes, options.locale));

  return ranges
    .map((range) => ({ ...range, text: input.slice(range.from, range.to) }))
    .filter((segment) => READABLE_CHARACTER.test(segment.text))
    .map((segment, index) => ({ ...segment, id: `speech-${index}` }));
}
