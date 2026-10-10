#!/usr/bin/env node
/**
 * @file rngit-work-tui.js
 *
 * Entry point for the rngit work-document TUI. Refuses to run without a
 * TTY (Ink needs an interactive terminal), then hands off to the app.
 */

// Identify as the app rather than "node" in process lists and tmux tabs.
process.title = "rngit-work-tui";

if (!process.stdout.isTTY) {
  console.error("rngit-work-tui requires an interactive terminal (TTY).");
  process.exit(1);
}

// Name the terminal window / tmux pane title; tmux picks the window name
// from it via automatic-rename-format (allow-rename must be on).
process.stdout.write("\x1b]2;rngit-work-tui\x07");
process.on("exit", () => {
  process.stdout.write("\x1b]2;\x07");
});

const { run } = await import("../src/tui/app.js");
await run();
