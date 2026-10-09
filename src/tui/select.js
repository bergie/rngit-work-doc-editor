/**
 * @file select.js
 *
 * Generic list selector for Ink: arrow/emacs keys, windowed display for long
 * lists, Enter (or →) to pick, Esc/q (or ←) to cancel. Labels are truncated
 * to the terminal width so each item always occupies exactly one row.
 */

import { Box, Text, useInput, useStdout } from "ink";
import { createElement as h, useState } from "react";

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
 * @param {object} props
 * @param {Array<{label: string, hint?: string, value?: any}>} props.items
 * @param {(item: any, index: number) => void} props.onSelect
 * @param {() => void} [props.onCancel]
 * @param {number} [props.maxVisible=12] - Windowed rows around the cursor.
 * @param {string} [props.emptyMessage="Nothing to show"]
 * @param {boolean} [props.active=true] - Whether key input is handled.
 */
export function Select({
	items,
	onSelect,
	onCancel,
	maxVisible = 12,
	emptyMessage = "Nothing to show",
	active = true,
}) {
	const [index, setIndex] = useState(0);
	const { stdout } = useStdout();
	const columns = stdout.columns > 0 ? stdout.columns : 80;
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
			if (key.upArrow || input === "k") {
				setIndex((i) => Math.max(0, i - 1));
			} else if (key.downArrow || input === "j") {
				setIndex((i) => Math.min(items.length - 1, i + 1));
			} else if (key.pageUp || (key.ctrl && input === "b")) {
				setIndex((i) => Math.max(0, i - maxVisible));
			} else if (key.pageDown || (key.ctrl && input === "f")) {
				setIndex((i) => Math.min(items.length - 1, i + maxVisible));
			} else if (key.return || key.rightArrow) {
				onSelect(items[index].value ?? items[index], index);
			}
		},
		{ isActive: active },
	);

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
