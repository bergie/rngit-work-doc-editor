/**
 * @file scan.js
 *
 * Discovers rngit repositories by scanning the working directory and its
 * direct children for `.git/config` files that contain an `rns://` remote
 * URL (set by `git clone rns://...` / `git-remote-rns`).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RNS_URL_RE } from "./config.js";

/**
 * Finds the first `rns://` URL in a `.git/config` file.
 * @param {string} dir - Directory whose `.git/config` should be inspected.
 * @returns {string|null} The URL, or `null` when absent.
 */
export function gitConfigUrl(dir) {
  let text;
  try {
    text = readFileSync(join(dir, ".git", "config"), "utf-8");
  } catch {
    return null;
  }
  const match = text.match(RNS_URL_RE);
  return match ? match[0] : null;
}

/**
 * Parses an `rns://<hash>/<group>/<repo>` URL into display components.
 * @param {string} url
 * @returns {{hash: string, group: string, repo: string, repoPath: string}}
 * @throws {Error} when the URL does not match the expected shape.
 */
export function parseUrl(url) {
  const rest = url.replace(/^rns:\/\//i, "");
  const parts = rest.split("/");
  if (parts.length !== 3 || !parts.every(Boolean)) {
    throw new Error(`Invalid rns:// URL: ${url}`);
  }
  const [hash, group, repo] = parts;
  return { hash, group, repo, repoPath: `${group}/${repo}` };
}

/**
 * Scans `startDir` and its direct subdirectories for rngit repositories.
 *
 * A directory counts as an rngit repository when it contains a `.git/config`
 * with at least one `rns://` remote URL. Results are deduplicated by URL and
 * sorted by repository path.
 *
 * @param {string} startDir - Directory to start scanning from.
 * @returns {Array<{dir: string, url: string, hash: string, group: string, repo: string, repoPath: string}>}
 */
export function scanForRepos(startDir) {
  const dirs = [startDir];
  try {
    for (const entry of readdirSync(startDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        dirs.push(join(startDir, entry.name));
      }
    }
  } catch {
    // Unreadable start directory: fall back to scanning just it.
  }

  const byUrl = new Map();
  for (const dir of dirs) {
    const url = gitConfigUrl(dir);
    if (!url || byUrl.has(url)) continue;
    try {
      const { hash, group, repo, repoPath } = parseUrl(url);
      byUrl.set(url, { dir, url, hash, group, repo, repoPath });
    } catch {
      // Malformed URL: skip this directory rather than failing the scan.
    }
  }

  return [...byUrl.values()].sort((a, b) =>
    a.repoPath.localeCompare(b.repoPath),
  );
}
