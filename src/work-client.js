/**
 * @file work-client.js
 *
 * @reticulum/core client for the **rngit work-document** protocol, adapted
 * from the `pi-rngit-work-document-skill` reference client.
 *
 * Wire contract (see the skill's `src/work-client.js` for full detail):
 *
 *  - Destination aspect: `"git.repositories"`.
 *  - Request path: `"/mgmt/work"`.
 *  - Request `data`: a msgpack **map** keyed by the integer `0`
 *    (`IDX_REPOSITORY`) plus string keys such as `operation`, `scope`,
 *    `doc_id`, `title`, `content`, `format`, `signature`. A plain JS object
 *    would coerce key `0` to `"0"` and the Python server would reject the
 *    request, so the payload is built as a `Map`.
 *  - Response: a msgpack `bin` blob whose first byte is a status code
 *    (`0` = OK; `1` disallowed, `2` invalid, `3` not found, `0xff` remote
 *    failure) followed by a msgpack payload or UTF-8 error message.
 *  - `create`, `propose` and `edit` sign the UTF-8 bytes of the trimmed
 *    content with the client's Ed25519 identity.
 *
 * Differences from the skill CLI client:
 *  - The `Identity` instance is injected, not loaded from a key file. This
 *    lets the TUI use the human's `~/.rngit` identity (64-byte private blob,
 *    loaded via `Identity.fromPrivateKey`) and swap to the secondary pi
 *    identity when the primary is rejected.
 *  - The `Reticulum` instance is injected and shared: one stack, two
 *    identities, no interface thrash when switching.
 */

import {
  Destination,
  DestType,
  LogLevel,
  MsgPack,
  Reticulum,
  toHex,
} from "@reticulum/core";
import {
  AutoInterface,
  FileStorageAdapter,
  LocalClientInterface,
  TCPClientInterface,
} from "@reticulum/node";
import { createBz2 } from "./bz2.js";
import {
  ASPECT,
  IDX_REPOSITORY,
  PATH_WORK,
  REQUEST_TIMEOUT_MS,
} from "./config.js";

/** Response status codes (first byte of every `/mgmt/work` response). */
export const Status = Object.freeze({
  OK: 0x00,
  DISALLOWED: 0x01,
  INVALID: 0x02,
  NOT_FOUND: 0x03,
  REMOTE_FAIL: 0xff,
});

/** Thrown when a `/mgmt/work` response carries a non-OK status byte. */
export class WorkError extends Error {
  /**
   * @param {number} status - Raw status byte from the server.
   * @param {string} [message]
   */
  constructor(status, message) {
    super(message || statusLabel(status));
    this.name = "WorkError";
    this.status = status;
  }
}

/** Thrown for local configuration problems (bad URL, missing identity). */
export class ConfigError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Returns a human-readable label for a status code.
 * @param {number} status
 * @returns {string}
 */
export function statusLabel(status) {
  switch (status) {
    case Status.OK:
      return "OK";
    case Status.DISALLOWED:
      return "Not allowed";
    case Status.INVALID:
      return "Invalid request";
    case Status.NOT_FOUND:
      return "Not found";
    case Status.REMOTE_FAIL:
      return "Remote error";
    default:
      return `Unknown status ${status}`;
  }
}

/**
 * Builds the msgpack `data` map for a `/mgmt/work` request. Uses a `Map` so
 * the integer `IDX_REPOSITORY` key stays an integer on the wire.
 *
 * @param {string} repoPath - `"group/repo"` repository path.
 * @param {Record<string, any>} [fields]
 * @returns {Map<number|string, any>}
 */
export function buildRequest(repoPath, fields = {}) {
  const map = new Map();
  map.set(IDX_REPOSITORY, repoPath);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) map.set(key, value);
  }
  return map;
}

/**
 * Decodes a `/mgmt/work` response blob (`status byte || msgpack payload`).
 *
 * @param {any} response - Expected to be a Uint8Array status+payload blob.
 * @returns {any} The decoded payload, or `null` for OK with no body.
 * @throws {WorkError} when the status byte is not `Status.OK`.
 */
export function parseResponse(response) {
  if (!(response instanceof Uint8Array)) {
    throw new WorkError(
      Status.REMOTE_FAIL,
      `Unexpected response type: ${response?.constructor?.name ?? typeof response}`,
    );
  }
  const status = response[0];
  if (status !== Status.OK) {
    const text =
      response.length > 1 ? new TextDecoder().decode(response.subarray(1)) : "";
    throw new WorkError(status, text || statusLabel(status));
  }
  if (response.length <= 1) return null;
  return MsgPack.decode(response.subarray(1));
}

/**
 * A Reticulum instance carrying the bz2 module for Link resource transfers
 * (`@reticulum/core` does not propagate `compressionProvider` to Links).
 *
 * @typedef {import("@reticulum/core").Reticulum & {bz2Module: Awaited<ReturnType<typeof createBz2>>}} RnsWithBz2
 */

/**
 * Creates the shared Reticulum stack used by every WorkClient in the TUI.
 *
 * Connects to a shared local core instance when available, otherwise boots
 * its own stack on AutoInterface plus (when configured) a TCP client to a
 * local `rnsd`. Core library logging is silenced entirely so stray output
 * never corrupts the Ink frame.
 *
 * @param {{cacheDir: string, rnsHost: string|null, rnsPort: number|null}} options
 * @returns {Promise<RnsWithBz2>}
 */
export async function createReticulum({ cacheDir, rnsHost, rnsPort }) {
  const bz2 = await createBz2();
  const rns = new Reticulum({
    storageAdapter: new FileStorageAdapter(cacheDir),
    compressionProvider: bz2,
    logLevel: LogLevel.NONE,
  });

  const shared = await LocalClientInterface.connectToSharedInstance();
  if (shared) {
    rns.addInterface(shared, true);
  } else {
    const auto = new AutoInterface({ name: "auto" });
    await auto.connect();
    rns.addInterface(auto, true);
    if (rnsHost && rnsPort) {
      const tcp = new TCPClientInterface({ host: rnsHost, port: rnsPort });
      await tcp.connect();
      rns.addInterface(tcp, true);
    }
  }

  await rns.ready();
  // @reticulum/core does not propagate compressionProvider to Links; stash it
  // so clients can inject it into each Link they create (rngit compresses its
  // responses with bz2).
  /** @type {RnsWithBz2} */ (rns).bz2Module = bz2;
  return /** @type {RnsWithBz2} */ (rns);
}

/**
 * A work-document client bound to one identity. Call {@link WorkClient.connect}
 * once, issue operations, then {@link WorkClient.close}. Switching identity
 * means discarding the client and building a new one on the same Reticulum
 * stack.
 */
export class WorkClient {
  /**
   * @param {object} options
   * @param {RnsWithBz2} options.rns - Shared Reticulum instance.
   * @param {import("@reticulum/core").Identity} options.identity - Client identity.
   * @param {Uint8Array} options.targetHash - 16-byte destination hash of the node.
   * @param {string} options.group - Repository group (first URL segment).
   * @param {string} options.repo - Repository name (second URL segment).
   * @param {number} [options.pathTimeoutMs=30000]
   * @param {number} [options.requestTimeoutMs=120000]
   * @param {number} [options.identifyDelayMs=150]
   */
  constructor(options) {
    if (!options?.rns) throw new ConfigError("rns instance is required");
    if (!options?.identity) throw new ConfigError("identity is required");
    if (!options?.targetHash) throw new ConfigError("targetHash is required");
    if (!options?.group || !options?.repo) {
      throw new ConfigError("group and repo are required");
    }
    this.rns = options.rns;
    this.identity = options.identity;
    this.targetHash = options.targetHash;
    this.group = options.group;
    this.repo = options.repo;
    this.repoPath = `${options.group}/${options.repo}`;
    this.pathTimeoutMs = options.pathTimeoutMs ?? 30000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
    this.identifyDelayMs = options.identifyDelayMs ?? 150;

    /** @type {import("@reticulum/core").Identity|null} */
    this.remoteIdentity = null;
    /** @type {import("@reticulum/core").Link|null} */
    this.link = null;
  }

  /**
   * Learns the remote identity, ensures a usable network path, establishes a
   * Link and identifies the client.
   *
   * A recalled identity alone is not enough: on a fresh boot the cached
   * routing path may be gone, so we solicit a path whenever none is active
   * and retry link establishment once with a freshly requested path.
   * @returns {Promise<void>}
   */
  async connect() {
    const { UnknownIdentityError } = await import("@reticulum/core");
    try {
      this.remoteIdentity = await this.rns.transport.recallOrSolicitIdentity(
        this.targetHash,
        this.pathTimeoutMs,
      );
    } catch (err) {
      if (err instanceof UnknownIdentityError) {
        throw new Error(
          `Could not learn an identity for ${toHex(this.targetHash)}. ` +
            "Is the node reachable and has it announced?",
        );
      }
      throw err;
    }

    try {
      await this.#openLink();
    } catch {
      // Stale cached path: solicit a fresh one and retry once.
      await this.#solicitPath();
      await this.#openLink();
    }
  }

  /**
   * Opens the Link to the remote destination and identifies this client.
   * @returns {Promise<void>}
   */
  async #openLink() {
    const dest = await Destination.OUT(
      ASPECT,
      DestType.SINGLE,
      this.remoteIdentity,
      this.rns,
    );
    this.link = await dest.createLink();
    this.link.bz2 = this.rns.bz2Module;
    await this.link.identify(this.identity);
    await new Promise((resolve) => setTimeout(resolve, this.identifyDelayMs));
  }

  /**
   * Requests a fresh path to the target and waits until one is known.
   * @returns {Promise<void>}
   */
  async #solicitPath() {
    const transport = this.rns.transport;
    try {
      await transport.requestPath(this.targetHash);
    } catch {
      // Best effort: a late announce may still populate the table.
    }
    const deadline = Date.now() + this.pathTimeoutMs;
    while (Date.now() < deadline) {
      if (
        typeof transport.hopsTo === "function" &&
        transport.hopsTo(this.targetHash) != null
      ) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(
      `No path to ${toHex(this.targetHash)} within ${this.pathTimeoutMs} ms. ` +
        "Is the node reachable?",
    );
  }

  /**
   * Sends a `/mgmt/work` request and decodes the response.
   * @param {Record<string, any>} fields
   * @returns {Promise<any>}
   */
  async _send(fields) {
    if (!this.link) throw new Error("Not connected; call connect() first.");
    const data = buildRequest(this.repoPath, fields);
    const response = await this.link.request(PATH_WORK, data, {
      timeout: this.requestTimeoutMs,
    });
    return parseResponse(response);
  }

  /**
   * Lists work documents.
   * @param {"active"|"completed"|"proposed"|"all"} [scope="active"]
   * @returns {Promise<Record<string, any[]>>}
   */
  async list(scope = "active") {
    return this._send({ operation: "list", scope });
  }

  /**
   * Views a single document (body + update history).
   * @param {number|string} docId
   * @param {"active"|"completed"|"proposed"|"all"} [scope="all"]
   * @returns {Promise<any>}
   */
  async view(docId, scope = "all") {
    return this._send({ operation: "view", doc_id: Number(docId), scope });
  }

  /**
   * Creates a new active work document. Requires `write`+`interact`.
   * @param {string} title
   * @param {string} content - Markdown body.
   * @returns {Promise<{id: number, scope: string}>}
   */
  async create(title, content) {
    const body = content.trim();
    const signature = await this.identity.sign(new TextEncoder().encode(body));
    return this._send({
      operation: "create",
      title,
      content: body,
      format: "markdown",
      signature,
    });
  }

  /**
   * Edits an existing document. Only the original author may edit.
   * @param {number|string} docId
   * @param {string} content
   * @param {{title?: string, scope?: string}} [options]
   * @returns {Promise<any>}
   */
  async edit(docId, content, { title, scope = "active" } = {}) {
    const body = content.trim();
    const signature = await this.identity.sign(new TextEncoder().encode(body));
    return this._send({
      operation: "edit",
      doc_id: Number(docId),
      scope,
      content: body,
      title,
      signature,
    });
  }

  /**
   * Adds an update (comment) to a document. Requires `interact`.
   * @param {number|string} docId
   * @param {string} content
   * @param {"active"|"completed"|"proposed"|"all"} [scope="active"]
   * @returns {Promise<{id: number}>}
   */
  async update(docId, content, scope = "active") {
    return this._send({
      operation: "comment",
      doc_id: Number(docId),
      scope,
      content,
      format: "markdown",
    });
  }

  /**
   * Marks a document complete (moves it to the `completed` scope).
   * @param {number|string} docId
   * @returns {Promise<{id: number}>}
   */
  async complete(docId) {
    return this._send({ operation: "complete", doc_id: Number(docId) });
  }

  /**
   * Reactivates a completed/proposed document (moves it to `active`).
   * @param {number|string} docId
   * @returns {Promise<{id: number}>}
   */
  async activate(docId) {
    return this._send({ operation: "activate", doc_id: Number(docId) });
  }

  /**
   * Deletes a document. The numeric ID becomes free for new documents.
   * @param {number|string} docId
   * @param {"active"|"completed"|"proposed"} [scope="active"]
   * @returns {Promise<any>}
   */
  async delete(docId, scope = "active") {
    return this._send({
      operation: "delete",
      doc_id: Number(docId),
      scope,
    });
  }

  /** Tears down the link. Safe to call multiple times. */
  async close() {
    if (this.link) {
      try {
        await this.link.teardown();
      } catch {
        // best-effort graceful close
      }
      this.link = null;
    }
  }
}
