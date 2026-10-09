/**
 * @file markdown.js
 *
 * Renders work-document markdown into ANSI-styled, hard-wrapped terminal
 * lines ready for display in a scrollable viewport.
 */

import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import wrapAnsi from "wrap-ansi";

/**
 * Configures marked with the terminal renderer for a given width.
 * @param {number} width - Content width in columns.
 */
function configureMarked(width) {
  marked.use(
    markedTerminal({
      width,
      reflowText: true,
      emoji: false,
      bullets: "•",
    }),
  );
}

/**
 * Renders a markdown string into an array of display lines.
 *
 * The marked-terminal output is hard-wrapped to `width` columns per line
 * (ANSI-aware, via wrap-ansi) so the result can be windowed for scrolling
 * without re-wrapping at render time.
 *
 * @param {string|null|undefined} markdown - Raw markdown source.
 * @param {number} width - Content width in columns.
 * @returns {string[]} ANSI-styled lines (no trailing blanks).
 */
export function renderMarkdownLines(markdown, width) {
  const source = (markdown ?? "").trim();
  if (!source) return ["(empty document)"];
  configureMarked(width);
  let rendered;
  try {
    rendered = /** @type {string} */ (marked.parse(source));
  } catch {
    rendered = source;
  }
  const lines = [];
  for (const raw of rendered.split("\n")) {
    for (const wrapped of wrapAnsi(raw, width, {
      hard: true,
      trim: false,
    }).split("\n")) {
      lines.push(wrapped.replace(/\s+$/, ""));
    }
  }
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.length ? lines : ["(empty document)"];
}

/**
 * Renders a timestamp as a short UTC string, or a dash when absent.
 * @param {number} [seconds] - Unix seconds.
 * @returns {string}
 */
export function formatTimestamp(seconds) {
  if (!seconds) return "—";
  return new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 16);
}
