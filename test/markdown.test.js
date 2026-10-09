import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTimestamp, renderMarkdownLines } from "../src/markdown.js";

test("renders headings, lists and code blocks into ANSI lines", () => {
  const md =
    "# Title\n\nSome *emphasis* text.\n\n- one\n- two\n\n```js\nconst x = 1;\n```\n";
  const lines = renderMarkdownLines(md, 80);
  assert.ok(lines.length > 5);
  assert.ok(lines.some((l) => l.includes("Title")));
  assert.ok(lines.some((l) => l.includes("one")));
  assert.ok(lines.some((l) => l.includes("const x = 1;")));
  // ANSI styling present somewhere (bold or colors from marked-terminal).
  // Chalk disables colors without a TTY, so only assert when forced on.
  if (process.env.FORCE_COLOR) {
    assert.ok(lines.some((l) => l.includes("\x1b[")));
  }
});

test("hard-wraps long lines to the requested width", () => {
  const md = `${"word ".repeat(60)}\n`;
  const lines = renderMarkdownLines(md, 40);
  for (const line of lines) {
    // strip ANSI escapes for the width check
    const ansiRe = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
    const bare = line.replace(ansiRe, "");
    assert.ok(bare.length <= 40, `line too long: ${bare.length}`);
  }
});

test("empty and missing content get a placeholder", () => {
  assert.deepEqual(renderMarkdownLines("", 80), ["(empty document)"]);
  assert.deepEqual(renderMarkdownLines(null, 80), ["(empty document)"]);
});

test("invalid markdown still renders as text", () => {
  const lines = renderMarkdownLines("plain text", 80);
  assert.deepEqual(lines, ["plain text"]);
});

test("formatTimestamp formats unix seconds and tolerates absence", () => {
  assert.equal(formatTimestamp(1760000000), "2025-10-09 08:53");
  assert.equal(formatTimestamp(0), "—");
  assert.equal(formatTimestamp(undefined), "—");
});
