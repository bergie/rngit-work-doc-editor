/**
 * @file select.js
 *
 * Generic list selector for Ink: arrow/emacs keys, windowed display for long
 * lists, Enter (or →) to pick, Esc/q (or ←) to cancel. Labels are truncated
 * to the terminal width so each item always occupies exactly one row.
 */

import { Box, Text, useInput, useStdout } from "ink";
import { createElement as h, useEffect, useRef, useState } from "react";

/**
 * Truncates a string with an ellipsis so it fits `width` columns (ANSI-free
 * labels only).
 * @param {string} text
 * @param {number} width
 * @returns {string}
 */
function fit(text, width) {
  if (width <= 1) return text.slice(0, Math.max(0, width));
  return text.length > width
    ? `${text.slice(0, Math.max(1, width - 1))}…`
    : text;
}

/**
 * Finds the index of the item matching `initialKey`, or -1 when there is no
 * match (including an empty list).
 * @param {Array<{label: string, hint?: string, value?: any}>} items
 * @param {(item: any) => any} itemKey
 * @param {any} initialKey
 * @returns {number}
 */
export function findInitialIndex(items, itemKey, initialKey) {
  if (initialKey === undefined || initialKey === null) return -1;
  return items.findIndex((item) => itemKey(item) === initialKey);
}

/**
 * @param {object} props
 * @param {Array<{label: string, hint?: string, value?: any}>} props.items
 * @param {(item: any, index: number) => void} props.onSelect
 * @param {() => void} [props.onCancel]
 * @param {number} [props.maxVisible=12] - Windowed rows around the cursor.
 * @param {string} [props.emptyMessage="Nothing to show"]
 * @param {boolean} [props.active=true] - Whether key input is handled.
 * @param {any} [props.initialKey] - Key of the item the cursor should start on (e.g. when returning to a list).
 * @param {(item: any) => any} [props.itemKey] - Extracts the identity compared against `initialKey`. Defaults to the item value.
 */
export function Select({
  items,
  onSelect,
  onCancel,
  maxVisible = 12,
  emptyMessage = "Nothing to show",
  active = true,
  initialKey,
  itemKey = (item) => item.value ?? item,
}) {
  const [index, setIndex] = useState(0);
  // Whether the user has moved the cursor themselves. Once they have, the
  // cursor belongs to them: an arriving `initialKey` (or a list refresh)
  // must not yank it back.
  const moved = useRef(false);
  const { stdout } = useStdout();
  const tty = /** @type {import("node:tty").WriteStream} */ (stdout);
  const columns = tty.columns > 0 ? tty.columns : 80;
  // Row budget: "❯ " prefix, two-space label/hint gap, one trailing column.
  const rowWidth = Math.max(20, columns - 3);

  useInput(
    (input, key) => {
      // Back navigation must work even with an empty list — an empty
      // result is a normal state, not a dead end.
      if (key.escape || input === "q" || key.leftArrow) {
        onCancel?.();
        return;
      }
      if (!items.length) return;
      if (key.upArrow || key.downArrow || key.pageUp || key.pageDown) {
        moved.current = true;
      }
      if (key.upArrow || input === "k") {
        setIndex((/** @type {number} */ i) => Math.max(0, i - 1));
      } else if (key.downArrow || input === "j") {
        setIndex((/** @type {number} */ i) =>
          Math.min(items.length - 1, i + 1),
        );
      } else if (key.pageUp || (key.ctrl && input === "b")) {
        setIndex((/** @type {number} */ i) => Math.max(0, i - maxVisible));
      } else if (key.pageDown || (key.ctrl && input === "f")) {
        setIndex((/** @type {number} */ i) =>
          Math.min(items.length - 1, i + maxVisible),
        );
      } else if (key.return || key.rightArrow) {
        onSelect(items[index].value ?? items[index], index);
      }
    },
    { isActive: active },
  );

  // Put the cursor on the item we came out of (e.g. the document whose
  // viewer was just closed) as soon as the list carries it.
  useEffect(() => {
    if (moved.current) return;
    const idx = findInitialIndex(items, itemKey, initialKey);
    if (idx >= 0) setIndex(idx);
  }, [items, initialKey, itemKey]);

  if (!items.length) {
    return h(
      Box,
      { flexDirection: "column" },
      h(Text, { dimColor: true }, emptyMessage),
      onCancel ? h(Text, { dimColor: true }, "←/Esc back") : null,
    );
  }

  // Window the list around the cursor so long lists stay visible.
  const start = Math.max(
    0,
    Math.min(index - Math.floor(maxVisible / 2), items.length - maxVisible),
  );
  const visible = items.slice(start, start + maxVisible);

  return h(
    Box,
    { flexDirection: "column" },
    visible.map((item, offset) => {
      const absolute = start + offset;
      const selected = absolute === index;
      // Fit label + hint into one terminal row.
      const gap = item.hint ? 2 : 0;
      const label = fit(item.label, rowWidth - gap);
      const hint = item.hint
        ? fit(item.hint, Math.max(0, rowWidth - label.length - gap))
        : null;
      return h(
        Box,
        { key: `${absolute}-${item.label}` },
        h(
          Text,
          {
            color: selected ? "black" : undefined,
            backgroundColor: selected ? "cyan" : undefined,
            bold: selected,
          },
          `${selected ? "❯ " : "  "}${label}`,
        ),
        hint
          ? h(
              Text,
              {
                color: selected ? "black" : "gray",
                backgroundColor: selected ? "cyan" : undefined,
              },
              `  ${hint}`,
            )
          : null,
      );
    }),
    h(
      Text,
      { dimColor: true },
      `(${index + 1}/${items.length}) ↑/↓ move · →/Enter select${onCancel ? " · ←/Esc back" : ""}`,
    ),
  );
}
