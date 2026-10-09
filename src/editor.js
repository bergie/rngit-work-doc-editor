/**
 * @file editor.js
 *
 * Runs an external editor ($VISUAL / $EDITOR) for document bodies and
 * updates. The TUI suspends to the alternate screen buffer while the editor
 * holds the terminal, then resumes.
 */

import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Picks the editor command: `$VISUAL`, then `$EDITOR`, then `vi`.
 * @returns {string}
 */
export function editorCommand() {
  return process.env.VISUAL || process.env.EDITOR || "vi";
}

/**
 * Opens `initial` in the user's editor and returns the resulting text.
 *
 * Writes the content to a temporary file, spawns the editor attached to the
 * terminal (stdio inherited), and reads the file back when the editor exits.
 * Never throws on a missing/failing editor — callers decide how to handle
 * the original content being returned unchanged.
 *
 * @param {string} initial - Content to edit ("" for a fresh update).
 * @param {{id: number|string, kind: "edit"|"update"}} docRef - For the temp filename.
 * @returns {Promise<string>} The edited content, or `initial` when the
 *   editor could not be launched.
 */
export async function runEditor(initial, docRef) {
  const tmp = join(
    tmpdir(),
    `rngit-work-${docRef.id}-${docRef.kind}-${Date.now()}.md`,
  );
  writeFileSync(tmp, initial, { mode: 0o600 });
  try {
    const code = await new Promise((resolve) => {
      const child = spawn(editorCommand(), [tmp], { stdio: "inherit" });
      child.on("exit", (code) => resolve(code ?? 0));
      child.on("error", () => resolve(-1));
    });
    if (code === -1) {
      return initial;
    }
    return readFileSync(tmp, "utf-8");
  } finally {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // best-effort cleanup
    }
  }
}
