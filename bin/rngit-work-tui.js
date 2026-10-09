#!/usr/bin/env node
/**
 * @file rngit-work-tui.js
 *
 * Entry point for the rngit work-document TUI. Refuses to run without a
 * TTY (Ink needs an interactive terminal), then hands off to the app.
 */

if (!process.stdout.isTTY) {
	console.error("rngit-work-tui requires an interactive terminal (TTY).");
	process.exit(1);
}

const { run } = await import("../src/tui/app.js");
await run();
