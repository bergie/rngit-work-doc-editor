/**
 * @file scrollable.js
 *
 * Scrollable ANSI text viewport for Ink. Content arrives as pre-rendered,
 * pre-wrapped lines (see `markdown.js`); this component windows them to the
 * terminal height and handles scroll keys.
 */

import { Box, Text, useInput, useStdout } from "ink";
import { createElement as h, useEffect, useState } from "react";

/** Rows reserved for chrome around the scroll area (header 2 + indicator 1 + status 2). */
const RESERVED_ROWS = 5;

/**
 * @param {object} props
 * @param {string[]} props.lines - Pre-wrapped, ANSI-styled content lines.
 * @param {import("react").ReactNode} props.header - Rendered above the viewport.
 * @param {string} [props.scrollHint] - Extra text in the scroll indicator.
 * @param {boolean} [props.active=true] - Whether scroll keys are handled.
 */
export function Scrollable({ lines, header, scrollHint = "", active = true }) {
	const { stdout } = useStdout();
	// `rows` can be 0 (pty without a reported size) or undefined (non-TTY).
	const rows = stdout.rows > 0 ? stdout.rows : 24;
	const viewportHeight = Math.max(1, rows - RESERVED_ROWS);
	const [scroll, setScroll] = useState(0);
	const maxScroll = Math.max(0, lines.length - viewportHeight);

	// Clamp when content shrinks (e.g. after a refresh) or the terminal grows.
	useEffect(() => {
		setScroll((s) => Math.min(s, maxScroll));
	}, [maxScroll]);

	useInput(
		(_input, key) => {
			if (key.upArrow) setScroll((s) => Math.max(0, s - 1));
			else if (key.downArrow) setScroll((s) => Math.min(maxScroll, s + 1));
			else if (key.pageUp || (key.ctrl && _input === "b"))
				setScroll((s) => Math.max(0, s - viewportHeight));
			else if (key.pageDown || (key.ctrl && _input === "f"))
				setScroll((s) => Math.min(maxScroll, s + viewportHeight));
			else if (_input === "g") setScroll(0);
			else if (_input === "G") setScroll(maxScroll);
		},
		{ isActive: active },
	);

	const visible = lines.slice(scroll, scroll + viewportHeight);

	return h(
		Box,
		{ flexDirection: "column", flexGrow: 1 },
		header ?? null,
		h(
			Box,
			{ flexDirection: "column", paddingLeft: 1, flexGrow: 1 },
			visible.map((line, i) => h(Text, { key: scroll + i }, line)),
		),
		h(
			Box,
			{ paddingLeft: 1 },
			h(
				Text,
				{ dimColor: true },
				`lines ${scroll + 1}-${Math.min(scroll + viewportHeight, lines.length)}/${lines.length}` +
					(scrollHint ? ` · ${scrollHint}` : ""),
			),
		),
	);
}
