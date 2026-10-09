/**
 * @file config.js
 *
 * Central configuration: file locations, environment overrides and protocol
 * constants shared by the scanner, identity loader and work client.
 */

import { homedir } from "node:os";
import { join } from "node:path";

/** Destination aspect for an rngit repository node. */
export const ASPECT = "git.repositories";

/** Request path for work-document operations. */
export const PATH_WORK = "/mgmt/work";

/** msgpack map key for the `"group/repo"` repository path. */
export const IDX_REPOSITORY = 0;

/** Valid work-document lifecycle scopes. */
export const SCOPES = ["active", "completed", "proposed", "all"];

/**
 * Matches an `rns://<32-hex-hash>/<group>/<repo>` URL anywhere in text.
 * Excludes quotes, backticks, brackets and whitespace so markdown-wrapped
 * URLs (e.g. `` `rns://...` ``) are captured cleanly.
 */
export const RNS_URL_RE =
  /rns:\/\/[0-9a-fA-F]{32}\/[^\s"'`)\]>]+\/[^\s"'`)\]>]+/;

/**
 * Primary identity: the human's rngit client identity. Standard 64-byte
 * private-key blob (`x25519(32) || ed25519(32)`, no public keys — they are
 * derived on load).
 * @returns {string}
 */
export function primaryIdentityPath() {
  return (
    process.env.RNGIT_PRIMARY_IDENTITY ??
    join(homedir(), ".rngit", "client_identity")
  );
}

/**
 * Secondary identity: pi's own work-document identity, used when the primary
 * identity lacks edit permission on a document but the secondary is the
 * author.
 * @returns {string|null}
 */
export function secondaryIdentityPath() {
  if (process.env.RNGIT_SECONDARY_IDENTITY === "") return null;
  return (
    process.env.RNGIT_SECONDARY_IDENTITY ??
    join(homedir(), ".pi-rngit-work", "identity.key")
  );
}

/**
 * Directory for the Reticulum stack's own persisted state (destination
 * cache, ratchets, path table). Distinct from any identity so a second run
 * starts with a warm path cache.
 * @returns {string}
 */
export function cacheDirectory() {
  return (
    process.env.RNGIT_WORK_TUI_CACHE ??
    join(homedir(), ".cache", "rngit-work-tui")
  );
}

/**
 * @returns {{rnsHost: string|null, rnsPort: number|null}}
 */
export function rnsEndpoint() {
  const host = process.env.RNS_HOST ?? null;
  const port = process.env.RNS_PORT ? Number(process.env.RNS_PORT) : null;
  return { rnsHost: host, rnsPort: port };
}

/** Max time to learn the remote node identity (path solicitation). */
export const PATH_TIMEOUT_MS = 30000;

/** Per-request response timeout. */
export const REQUEST_TIMEOUT_MS = 120000;
