/**
 * @file identity.js
 *
 * Loads Reticulum identities from the two on-disk key sources:
 *
 *  - Primary:   `~/.rngit/client_identity` — the human's rngit client
 *               identity. A 64-byte private-key blob (x25519 || ed25519)
 *               without public keys; @reticulum/core derives them.
 *  - Secondary: `~/.pi-rngit-work/identity.key` — pi's work-document
 *               identity. A 128-byte private+public export; used as a
 *               fallback when the primary identity lacks edit permission
 *               on a document but the secondary is the author.
 */

import { readFileSync } from "node:fs";
import { Identity, toHex } from "@reticulum/core";
import { primaryIdentityPath, secondaryIdentityPath } from "./config.js";

/**
 * Builds an identity from key bytes of either supported length.
 *
 * @param {Uint8Array} bytes - 64-byte private blob (public keys derived) or
 *   128-byte private+public export.
 * @returns {Promise<Identity|null>}
 */
export async function identityFromKeyBytes(bytes) {
  if (bytes.length === 128) {
    return Identity.fromBytes(bytes);
  }
  if (bytes.length === 64) {
    return Identity.fromPrivateKey(bytes);
  }
  return null;
}

/**
 * Loads an identity from a key file path.
 * @param {string} path
 * @param {string} label - Human-readable label for error messages.
 * @returns {Promise<Identity|null>} `null` when the file does not exist.
 * @throws {Error} when the file exists but holds unusable key material.
 */
export async function loadIdentityFile(path, label) {
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === "ENOENT") {
      return null;
    }
    throw new Error(
      `Cannot read ${label} identity at ${path}: ${/** @type {Error} */ (err).message}`,
    );
  }
  const identity = await identityFromKeyBytes(bytes);
  if (!identity) {
    throw new Error(
      `${label} identity at ${path} is ${bytes.length} bytes; expected a 64-byte ` +
        "private-key blob or a 128-byte private+public export",
    );
  }
  return identity;
}

/**
 * Loads the primary `~/.rngit` identity.
 * @returns {Promise<Identity|null>}
 */
export async function loadPrimaryIdentity() {
  return loadIdentityFile(primaryIdentityPath(), "Primary (rngit)");
}

/**
 * Loads the secondary pi identity, or `null` when it is absent (all
 * secondary-dependent features degrade gracefully).
 * @returns {Promise<Identity|null>}
 */
export async function loadSecondaryIdentity() {
  const path = secondaryIdentityPath();
  if (!path) return null;
  return loadIdentityFile(path, "Secondary (pi)");
}

/**
 * Returns the 32-char hex hash of an identity.
 * @param {Identity} identity
 * @returns {string}
 */
export function identityHashHex(identity) {
  return toHex(identity.identityHash);
}
