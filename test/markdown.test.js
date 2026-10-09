import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTimestamp, renderMarkdownLines } from "../src/markdown.js";

/**
 * Strips ANSI escape sequences — chalk honours TTY/FORCE_COLOR, so content
 * assertions must be insensitive to styling.
 * @param {string} s
 * @returns {string}
 */
const stripAnsi = (s) =>
  s.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");

test("renders headings, lists and code blocks into ANSI lines", () => {
  const md =
    "# Title\n\nSome *emphasis* text.\n\n- one\n- two\n\n```js\nconst x = 1;\n```\n";
  const lines = renderMarkdownLines(md, 80);
  assert.ok(lines.length > 5);
  const bare = lines.map(stripAnsi);
  assert.ok(bare.some((l) => l.includes("Title")));
  assert.ok(bare.some((l) => l.includes("one")));
  assert.ok(bare.some((l) => l.includes("const x = 1;")));
  // ANSI styling present somewhere when colors are force-enabled; chalk
  // disables colors without a TTY, so only assert when forced on.
  if (process.env.FORCE_COLOR) {
    assert.ok(
      lines.some((l) => l.includes("\x1b[")) || process.env.FORCE_COLOR === "0",
    );
  }
});

test("hard-wraps long lines to the requested width", () => {
  const md = `${"word ".repeat(60)}\n`;
  const lines = renderMarkdownLines(md, 40);
  for (const line of lines) {
    const bare = stripAnsi(line);
    assert.ok(bare.length <= 40, `line too long: ${bare.length}`);
  }
});

test("empty and missing content get a placeholder", () => {
  assert.deepEqual(renderMarkdownLines("", 80).map(stripAnsi), [
    "(empty document)",
  ]);
  assert.deepEqual(renderMarkdownLines(null, 80).map(stripAnsi), [
    "(empty document)",
  ]);
});

test("invalid markdown still renders as text", () => {
  assert.deepEqual(renderMarkdownLines("plain text", 80).map(stripAnsi), [
    "plain text",
  ]);
});

test("formatTimestamp formats unix seconds and tolerates absence", () => {
  assert.equal(formatTimestamp(1760000000), "2025-10-09 08:53");
  assert.equal(formatTimestamp(0), "—");
  assert.equal(formatTimestamp(undefined), "—");
});
