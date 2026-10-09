# rngit-work-doc-editor

A terminal UI for reading and managing rngit work documents over the [Reticulum](https://reticulum.network) mesh. Built with [Ink](https://github.com/vadimdemedes/ink) and [@reticulum/core](https://www.npmjs.com/package/@reticulum/core) — no build step, plain ESM JavaScript.

## Features

- Discovers rngit repositories by scanning the working directory and its direct children for `.git/config` files with `rns://` git remotes.
- Lists work documents grouped by lifecycle scope (active, proposed, completed) with author, timestamps and update counts.
- Reads documents as nicely formatted markdown in a scrollable viewport, including their update history.
- Lifecycle actions follow the rngit state machine: proposed documents can be activated, active documents completed, and completed documents re-activated. Documents can be deleted from any scope (a deleted document's number becomes free for reuse by new documents).
- Uses the human's rngit identity from `~/.rngit/client_identity` by default, and can fall back to a secondary identity (e.g. `~/.pi-rngit-work/identity.key`) when the primary is rejected or when the secondary authored the document.

## Requirements

- Node.js 22 or newer (Ink 8 requires it)
- Reachability of the rngit repository node over Reticulum: the client uses a shared local Reticulum instance when available, otherwise it brings up its own stack on AutoInterface, plus a TCP link to a local `rnsd` when `RNS_HOST`/`RNS_PORT` are set
- An rngit identity: `~/.rngit/client_identity` is loaded as the primary identity. Listing documents requires `read` permission; completing, activating, deleting and commenting require `write` plus `interact` on the node

## Usage

```sh
npm start          # or: node bin/rngit-work-tui.js
```

The app starts fullscreen in the alternate screen buffer. Keys:

| Key | Action |
| --- | --- |
| `↑`/`↓` or `j`/`k` | Move in lists, scroll documents |
| `→` or Enter | Open the selected repository / document |
| `←` or Esc | Go back |
| `r` | Rescan repositories / refresh documents / refresh the open document |
| `c` | Complete the open document (active scope only) |
| `a` | Activate the open document (proposed or completed scope) |
| `d` | Delete the open document (with confirmation) |
| `e` | Edit the open document body in `$VISUAL`/`$EDITOR` (author only) |
| `u` | Write an update (comment) on the open document via the editor |
| `i` | Switch between the primary and secondary identity |
| `g` / `G` | Jump to the top / bottom of a document |
| `q` | Quit (also Ctrl-C) |

Failed actions report the node's error in the status bar. When a write action is rejected as "not allowed" with the primary identity and a secondary identity exists, the app offers to retry with the secondary.

## Configuration

| Environment variable | Meaning | Default |
| --- | --- | --- |
| `RNGIT_PRIMARY_IDENTITY` | Path to the primary identity key | `~/.rngit/client_identity` |
| `RNGIT_SECONDARY_IDENTITY` | Path to the secondary identity key (set to empty string to disable) | `~/.pi-rngit-work/identity.key` |
| `RNGIT_WORK_TUI_CACHE` | Directory for the Reticulum path cache | `~/.cache/rngit-work-tui` |
| `RNS_HOST` / `RNS_PORT` | Local `rnsd` TCP interface (both required to enable TCP) | — |

## Development

```sh
npm install
npm test       # tsc --noEmit type checking + node --test unit tests
npm run lint   # biome check
npm run format # biome check --write
```

`scripts/smoke-connect.js` is a headless connectivity check against a repository directory:

```sh
node scripts/smoke-connect.js ~/Projects/some-rngit-repo
```

## Acknowledgements

This project has been built with the assistance of LLMs, both for conceptual planning and implementation. I acknowledge that AI code is not necessarily ideal, but at the same time, I'm [busy sailing](https://lille-oe.de).

## License

[EUPL-1.2](LICENSE)
