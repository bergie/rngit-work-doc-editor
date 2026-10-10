# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to no scheduled release cadence — versions are cut when meaningful functionality lands.

## [Unreleased]

## [0.3.0] - 2026-10-10

### Added

- Space pages down in the document viewer.
- Update (comment) headers show the author identity hash.
- Process identification: the app runs as `rngit-work-tui` in process lists and tmux tab titles instead of `node` (tmux needs `allow-rename on` to honor application titles).
- Package metadata (`repository`, `homepage`, `bugs`) for npm provenance publishing.

### Fixed

- Document viewport height no longer varies while scrolling: blank markdown lines now occupy a terminal row (Ink collapses empty text elements, which made the content area shrink in blank-heavy sections).
- Markdown tests are deterministic regardless of terminal color support (TTY vs `FORCE_COLOR`): content assertions strip ANSI styling before comparing.

## [0.2.0] - 2026-10-09

### Added

- Fullscreen Ink-based TUI for reading and managing rngit work documents over the Reticulum mesh (`rngit-work-tui`).
- Repository discovery: scans the working directory and its direct children for `.git/config` files with `rns://` git remotes.
- Work-document listing grouped by lifecycle scope (active, proposed, completed) with author, timestamps and update counts.
- Document viewer with ANSI-rendered markdown (headings, lists, code blocks), hard-wrapped to the terminal width, scrollable viewport, and rendered update history.
- Lifecycle actions following the state machine: `proposed → activate`, `active → complete`, `completed → re-activate`; delete available in every scope (deleted IDs may be reused by new documents).
- Primary/secondary identity support: uses the human `~/.rngit/client_identity` by default and can fall back to the `~/.pi-rngit-work` identity when the primary is rejected or when the secondary authored the document.
- Arrow-key navigation (`→` select/open, `←` back, with `q`/Ctrl-C to quit from the project list).
- Editing documents and writing updates through the external editor (`$VISUAL`/`$EDITOR`): the TUI suspends while the editor holds the terminal, and unchanged or empty drafts are discarded with a notice. Only the original author can edit; identity fallback applies to both operations.
- Link robustness: automatic path re-solicitation and one link-establishment retry when the cached routing path is stale.
- Headless smoke script (`scripts/smoke-connect.js`) for connectivity checks.
- Unit tests for repository scanning, identity loading, the work-document wire format, markdown rendering and the lifecycle state machine (`node --test` plus `tsc --noEmit` type checking).
