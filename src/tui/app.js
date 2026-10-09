/**
 * @file app.js
 *
 * Root TUI application: repository picker → work-document list → document
 * viewer with lifecycle actions (complete/activate), scrolling markdown
 * rendering and primary/secondary identity fallback.
 */

import { fromHex } from "@reticulum/core";
import { Box, render, Text, useApp, useInput, useStdout } from "ink";
import {
  createElement as h,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cacheDirectory, rnsEndpoint } from "../config.js";
import { runEditor } from "../editor.js";
import {
  identityHashHex,
  loadPrimaryIdentity,
  loadSecondaryIdentity,
} from "../identity.js";
import { availableTransitions } from "../lifecycle.js";
import { formatTimestamp, renderMarkdownLines } from "../markdown.js";
import { scanForRepos } from "../scan.js";
import {
  createReticulum,
  Status,
  WorkClient,
  WorkError,
} from "../work-client.js";
import { ConfirmDialog } from "./dialog.js";
import { Scrollable } from "./scrollable.js";
import { Select } from "./select.js";

/** Braille spinner frames. */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * The long-lived session holding the shared Reticulum stack, loaded
 * identities and per-(identity, repo) work clients.
 *
 * @typedef {object} Session
 * @property {import("@reticulum/core").Reticulum|null} rns - Shared stack.
 * @property {{primary: import("@reticulum/core").Identity|null|undefined, secondary: import("@reticulum/core").Identity|null|undefined}} identities
 * @property {Map<string, WorkClient>} clients - Keyed by `"role:repoPath"`.
 * @property {() => Promise<void>} loadIdentities
 * @property {(repo: RepoInfo, role: "primary"|"secondary") => Promise<WorkClient>} getClient
 * @property {() => Promise<void>} shutdown
 */

/**
 * A repository discovered by the scanner.
 *
 * @typedef {object} RepoInfo
 * @property {string} dir - Directory containing the repository.
 * @property {string} url - Full `rns://` remote URL.
 * @property {string} hash - 32-char destination hash hex.
 * @property {string} group - Repository group.
 * @property {string} repo - Repository name.
 * @property {string} repoPath - `"group/repo"`.
 */

/**
 * Creates the long-lived session object.
 *
 * @returns {Session}
 */
function createSession() {
  /** @type {Session} */
  const session = {
    rns: null,
    identities: { primary: undefined, secondary: undefined },
    clients: new Map(),

    /**
     * Loads both identities from disk. `primary` must exist; `secondary`
     * is optional.
     */
    async loadIdentities() {
      if (session.identities.primary === undefined) {
        session.identities.primary = await loadPrimaryIdentity();
      }
      if (session.identities.secondary === undefined) {
        session.identities.secondary = await loadSecondaryIdentity();
      }
      if (!session.identities.primary) {
        const { primaryIdentityPath } = await import("../config.js");
        throw new Error(
          `No rngit identity found at ${primaryIdentityPath()}. ` +
            "Run `rngit` once to create one, or set RNGIT_PRIMARY_IDENTITY.",
        );
      }
    },

    /**
     * Returns a connected WorkClient for the given repo and identity role,
     * creating and connecting it on first use. Clients bound to other
     * repositories are closed when the repository changes.
     *
     * @param {{hash: string, group: string, repo: string, repoPath: string}} repo
     * @param {"primary"|"secondary"} role
     */
    async getClient(repo, role) {
      if (!session.rns) {
        session.rns = await createReticulum({
          cacheDir: cacheDirectory(),
          ...rnsEndpoint(),
        });
      }
      const key = `${role}:${repo.repoPath}`;
      const existing = session.clients.get(key);
      if (existing) return existing;
      for (const [otherKey, client] of session.clients) {
        if (!otherKey.endsWith(`:${repo.repoPath}`)) {
          await client.close();
          session.clients.delete(otherKey);
        }
      }
      const identity =
        role === "primary"
          ? session.identities.primary
          : session.identities.secondary;
      if (!identity) {
        throw new Error(`No ${role} identity loaded`);
      }
      const client = new WorkClient({
        rns: /** @type {any} */ (session.rns),
        identity,
        targetHash: fromHex(repo.hash),
        group: repo.group,
        repo: repo.repo,
      });
      await client.connect();
      session.clients.set(key, client);
      return client;
    },

    /** Tears down the link and the Reticulum stack. */
    async shutdown() {
      for (const client of session.clients.values()) {
        await client.close();
      }
      session.clients.clear();
      if (session.rns) {
        await session.rns.stop();
        session.rns = null;
      }
    },
  };
  return session;
}

/** @param {number} ms @returns {string} */
function spinnerFrame(ms) {
  return SPINNER_FRAMES[Math.floor(ms / 80) % SPINNER_FRAMES.length];
}

/**
 * Simple self-animated spinner line.
 * @param {object} props
 * @param {string} props.label
 */
function Spinner({ label }) {
  const [start] = useState(() => Date.now());
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(timer);
  }, []);
  return h(
    Text,
    { color: "cyan" },
    `${spinnerFrame(Date.now() - start)} ${label}`,
  );
}

/**
 * Error banner with a dim hint.
 * @param {object} props
 * @param {string} props.message
 * @param {string} [props.hint]
 */
function ErrorBanner({ message, hint }) {
  return h(
    Box,
    {
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "red",
      paddingX: 1,
    },
    h(Text, { color: "red" }, `✗ ${message}`),
    hint ? h(Text, { dimColor: true }, hint) : null,
  );
}

/**
 * View screen body while loading or after an error, before any document is
 * held. Handles retry and back keys.
 */
/**
 * @param {object} props
 * @param {string|null} props.loading
 * @param {string|null} props.error
 * @param {() => void} props.onRetry
 * @param {() => void} props.onBack
 */
function ViewPlaceholder({ loading, error, onRetry, onBack }) {
  // Back must stay available even while a request is in flight — a slow
  // fetch must never trap the user.
  useInput((input, key) => {
    if (!loading && input === "r") onRetry();
    else if (key.escape || input === "q" || key.leftArrow) onBack();
  });
  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    loading ? h(Spinner, { label: `${loading} — q to go back` }) : null,
    !loading && error
      ? h(Text, { color: "red" }, `✗ ${error} — press r to retry.`)
      : null,
  );
}

/**
 * Shared status area: one compact dynamic line (spinner, notice or error —
 * never more than one row, so the frame height stays constant) plus the
 * identity/hints footer line.
 * @param {object} props
 * @param {string} props.hints
 * @param {{role: string, hash: string}|null} props.identity
 * @param {string|null} props.notice
 * @param {string|null} props.error
 * @param {boolean} props.busy
 * @param {string} [props.busyLabel] - Spinner label while `busy`.
 */
function StatusBar({ hints, identity, notice, error, busy, busyLabel }) {
  const left = identity
    ? `id: ${identity.role === "primary" ? "rngit" : "pi"} ${identity.hash.slice(0, 8)}…`
    : "id: none";
  return h(
    Box,
    { flexDirection: "column", marginTop: 1, paddingLeft: 1 },
    // Always one row, so the frame height never changes.
    h(
      Box,
      { height: 1 },
      busy
        ? h(Spinner, { label: busyLabel ?? "working…" })
        : error
          ? h(Text, { color: "red" }, `✗ ${error}`)
          : notice
            ? h(Text, { color: "green" }, `✓ ${notice}`)
            : h(Text, null, " "),
    ),
    h(
      Box,
      { justifyContent: "space-between" },
      h(Text, { dimColor: true }, left),
      h(Text, { dimColor: true }, hints),
    ),
  );
}

// --- Screen: repository picker --------------------------------------------

/**
 * @param {object} props
 * @param {{dir: string, url: string, hash: string, group: string, repo: string, repoPath: string}[]} props.repos
 * @param {(repo: RepoInfo) => void} props.onSelect
 * @param {() => void} props.onQuit
 * @param {() => void} props.onRescan
 * @param {string} props.startDir
 * @param {number} props.maxVisible
 */
function RepoScreen({
  repos,
  onSelect,
  onQuit,
  onRescan,
  startDir,
  maxVisible,
}) {
  useInput((_input, _key) => {
    // Quitting is deliberate on the top-level screen: only q (or Ctrl-C).
    // ← and Esc do nothing here — they would be too easy to hit by accident.
    if (_input === "r") onRescan();
    else if (_input === "q") onQuit();
  });
  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    h(Text, { bold: true }, "rngit work documents"),
    h(
      Text,
      { dimColor: true },
      `Scanning ${startDir} (and one level down) for rns:// git remotes`,
    ),
    h(
      Box,
      { marginTop: 1 },
      h(Select, {
        items: repos.map((repo) => ({
          label: repo.repoPath,
          hint: `${repo.dir.replace(startDir, ".") || "."} · ${repo.hash.slice(0, 8)}…`,
          value: repo,
        })),
        onSelect,
        maxVisible,
        emptyMessage:
          "No rngit repositories found here. Press r to rescan, q to quit.",
      }),
    ),
  );
}

// --- Screen: document list --------------------------------------------------

const SCOPE_ORDER = [
  ["Active", "active"],
  ["Proposed", "proposed"],
  ["Completed", "completed"],
];

/**
 * @param {object} props
 * @param {{group: string, repo: string, repoPath: string}} props.repo
 * @param {Record<string, any[]>|null} props.docs
 * @param {(doc: any) => void} props.onOpen
 * @param {() => void} props.onBack
 * @param {() => void} props.onRefresh
 * @param {() => void} props.onSwitchIdentity
 * @param {{role: string, hash: string}} props.identity
 * @param {number} props.maxVisible
 */
function DocListScreen({
  repo,
  docs,
  onOpen,
  onBack,
  onRefresh,
  onSwitchIdentity,
  identity,
  maxVisible,
}) {
  const items = useMemo(() => {
    if (!docs) return [];
    const out = [];
    for (const [, scope] of SCOPE_ORDER) {
      for (const doc of docs[scope] ?? []) {
        const mine =
          doc.author === identity.hash ||
          (doc.meta?.author ?? "").toLowerCase() === identity.hash;
        out.push({
          label: `#${doc.id} ${scope === "active" ? "" : scope === "proposed" ? "[proposed] " : "[done] "}${doc.title ?? "Untitled"}`,
          hint: `${mine ? "you" : (doc.author ?? "").slice(0, 8) || "?"} · ${formatTimestamp(doc.created)} · ${doc.comments ?? 0} upd`,
          value: doc,
        });
      }
    }
    return out;
  }, [docs, identity.hash]);

  useInput((_input, key) => {
    if (_input === "r") onRefresh();
    else if (_input === "i") onSwitchIdentity();
    else if (key.escape || _input === "q") onBack();
  });

  return h(
    Box,
    { flexDirection: "column", padding: 1 },
    h(Text, { bold: true }, `Work documents — ${repo.repoPath}`),
    h(
      Box,
      { marginTop: 1 },
      h(Select, {
        items,
        onSelect: onOpen,
        onCancel: onBack,
        maxVisible,
        emptyMessage: docs ? "No work documents in any scope." : undefined,
      }),
    ),
  );
}

// --- Screen: document viewer -------------------------------------------------

/**
 * @param {object} props
 * @param {any} props.doc
 * @param {{role: string, hash: string}} props.identity
 * @param {string|null} props.secondaryHash - Hash of the secondary identity, when loaded.
 * @param {boolean} props.inputEnabled
 * @param {(op: "complete"|"activate") => void} props.onAction
 * @param {() => void} props.onDelete
 * @param {() => void} props.onEdit
 * @param {() => void} props.onUpdate
 * @param {() => void} props.onBack
 * @param {() => void} props.onRefresh
 */
function DocViewScreen({
  doc,
  identity,
  secondaryHash,
  inputEnabled,
  onAction,
  onDelete,
  onEdit,
  onUpdate,
  onBack,
  onRefresh,
}) {
  const { stdout } = useStdout();
  // `columns` can be 0 (pty without a reported size) or undefined (non-TTY).
  const tty = /** @type {import("node:tty").WriteStream} */ (stdout);
  const columns = tty.columns > 0 ? tty.columns : 80;
  const contentWidth = Math.max(40, columns - 6);

  const meta = doc?.meta ?? {};
  const bodyLines = useMemo(
    () => renderMarkdownLines(doc?.content ?? "", contentWidth),
    [doc?.content, contentWidth],
  );
  const comments = Array.isArray(doc?.comments) ? doc.comments : [];
  const commentLines = useMemo(() => {
    const out = [];
    for (const c of comments) {
      const parts = [
        `update #${c.id}`,
        ...(c.author ? [`by ${c.author.slice(0, 8)}`] : []),
        formatTimestamp(c.created),
      ];
      out.push("", `── ${parts.join(" · ")} `.padEnd(contentWidth, "─"));
      out.push(...renderMarkdownLines(c.content ?? "", contentWidth));
    }
    return out;
  }, [comments, contentWidth]);
  const allLines = useMemo(
    () => [...bodyLines, ...commentLines, ""],
    [bodyLines, commentLines],
  );

  const author = (meta.author ?? "").toLowerCase();
  const isMine = author === identity.hash;
  const scope = meta.scope ?? doc?.scope ?? "active";
  // Lifecycle state machine: proposed → activate, active → complete,
  // completed → activate. Delete is available in every scope.
  const transitions = availableTransitions(scope);
  const canComplete = transitions.includes("complete");
  const canActivate = transitions.includes("activate");
  const canDelete = true;
  // Editing is author-only: offer it when the active identity is the author,
  // or when the secondary identity is (submitting then auto-uses it).
  const canEdit = isMine || author === secondaryHash;

  useInput(
    (input, key) => {
      if (input === "c" && canComplete) onAction("complete");
      else if (input === "a" && canActivate) onAction("activate");
      else if (input === "d" && canDelete) onDelete();
      else if (input === "e" && canEdit) onEdit();
      else if (input === "u") onUpdate();
      else if (input === "r") onRefresh();
      else if (key.escape || input === "q" || key.leftArrow) onBack();
    },
    { isActive: inputEnabled },
  );

  const header = h(
    Box,
    { flexDirection: "column", paddingLeft: 1, marginBottom: 0 },
    h(Text, { bold: true }, `${meta.title ?? "Untitled"} (#${doc?.id ?? "?"})`),
    h(
      Text,
      { dimColor: true },
      [
        `${scope[0].toUpperCase()}${scope.slice(1)}`,
        isMine ? "authored by you" : `by ${author.slice(0, 8) || "?"}`,
        `created ${formatTimestamp(meta.created)}`,
        `edited ${formatTimestamp(meta.edited)}`,
        meta.signature ? "signed" : "unsigned",
      ].join(" · "),
    ),
  );

  const actions = [];
  if (canComplete) actions.push("c complete");
  if (canActivate)
    actions.push(scope === "completed" ? "a re-activate" : "a activate");
  if (canDelete) actions.push("d delete");
  if (canEdit) actions.push("e edit");
  actions.push("u update", "r refresh", "q back");

  return h(Scrollable, {
    lines: allLines,
    header,
    active: inputEnabled,
    scrollHint: actions.join(" · "),
  });
}

// --- Root --------------------------------------------------------------------

/**
 * Suspend the TUI (leave the alternate screen), run the external editor on
 * the document body or an empty update draft, resume, and hand the edited
 * text back.
 *
 * @param {object} props
 * @param {{kind: "edit"|"update"}} props.editor
 * @param {any} props.doc - The open document.
 * @param {(content: string) => void} props.onComplete
 */
function EditorRunner({ editor, doc, onComplete }) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs exactly once per mount; the editor kind, document snapshot and callback are intentionally frozen at open time
  useEffect(() => {
    let cancelled = false;
    (async () => {
      process.stdout.write("\x1b[?1049l");
      const content = await runEditor(
        editor.kind === "edit" ? (doc?.content ?? "") : "",
        { id: doc?.id ?? "?", kind: editor.kind },
      );
      if (cancelled) return;
      // Re-enter the alternate screen and start from a clean slate.
      process.stdout.write("\x1b[?1049h\x1b[H\x1b[2J");
      onComplete(content);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return h(Box, { height: 1 });
}

/**
 * @param {object} props
 * @param {Session} props.session
 */
function App({ session }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  // `rows` can be 0 (pty without a reported size) or undefined (non-TTY).
  const tty = /** @type {import("node:tty").WriteStream} */ (stdout);
  const rows = tty.rows > 0 ? tty.rows : 24;
  // Rows available for a windowed list: screen chrome (padding, heading,
  // margins, count line, status area) — items never wrap, so this is exact.
  const reposListMax = Math.max(3, rows - 8);
  const docsListMax = Math.max(3, rows - 7);
  const [screen, setScreen] = useState(
    /** @type {"repos"|"docs"|"view"} */ ("repos"),
  );
  const [repos, setRepos] = useState(() => scanForRepos(process.cwd()));
  const [repo, setRepo] = useState(/** @type {RepoInfo|null} */ (null));
  const [docs, setDocs] = useState(
    /** @type {Record<string, any[]>|null} */ (null),
  );
  const [doc, setDoc] = useState(/** @type {any} */ (null));
  const [loading, setLoading] = useState(/** @type {string|null} */ (null));
  const [error, setError] = useState(/** @type {string|null} */ (null));
  const [notice, setNotice] = useState(/** @type {string|null} */ (null));
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState(/** @type {string|null} */ (null));
  const [confirm, setConfirm] = useState(
    /** @type {{message: string, action: () => void}|null} */ (null),
  );
  const [role, setRole] = useState(
    /** @type {"primary"|"secondary"} */ ("primary"),
  );
  const roleRef = useRef(/** @type {"primary"|"secondary"} */ ("primary"));
  const [editor, setEditor] = useState(
    /** @type {{kind: "edit"|"update"}|null} */ (null),
  );

  // Load identities once on mount.
  useEffect(() => {
    session
      .loadIdentities()
      .then(() => setReady(true))
      .catch((/** @type {unknown} */ err) =>
        setFatal(/** @type {Error} */ (err).message),
      );
  }, [session]);

  const identity =
    role === "primary"
      ? session.identities.primary
      : session.identities.secondary;
  const identityInfo = identity
    ? { role, hash: identityHashHex(identity) }
    : null;

  /**
   * Switches the active identity to the other one (when available) and
   * re-fetches the document list with it.
   */
  async function switchIdentity() {
    if (!session.identities.secondary) {
      setNotice("No secondary identity available");
      return;
    }
    const next = roleRef.current === "primary" ? "secondary" : "primary";
    setRole(next);
    roleRef.current = next;
    setNotice(
      `Switched to the ${next === "primary" ? "rngit" : "pi"} identity`,
    );
    if (screen === "docs") await refreshDocs();
  }

  /** Clears transient messages. */
  function clearMessages() {
    setError(null);
    setNotice(null);
  }

  /** Rescans the working directory for rngit repositories. */
  function rescan() {
    clearMessages();
    setRepos(scanForRepos(process.cwd()));
  }

  /** Opens the document list for a repository. */
  async function selectRepo(/** @type {RepoInfo} */ selected) {
    clearMessages();
    setRepo(selected);
    setScreen("docs");
    setDocs(null);
    setLoading("connecting to node…");
    try {
      const client = await session.getClient(selected, roleRef.current);
      setLoading("fetching documents…");
      setDocs(await client.list("all"));
    } catch (/** @type {unknown} */ err) {
      setError(/** @type {Error} */ (err).message);
    } finally {
      setLoading(null);
    }
  }

  /**
   * Re-fetches the document list with the current client. Deliberately does
   * not clear messages: callers rely on notices/errors staying visible.
   */
  async function refreshDocs() {
    if (!repo) return;
    setLoading("refreshing…");
    try {
      const client = await session.getClient(repo, roleRef.current);
      setDocs(await client.list("all"));
    } catch (/** @type {unknown} */ err) {
      setError(/** @type {Error} */ (err).message);
    } finally {
      setLoading(null);
    }
  }

  /** Opens a document for reading. */
  async function openDoc(/** @type {any} */ selected) {
    clearMessages();
    setScreen("view");
    setDoc(null);
    setLoading("fetching document…");
    if (!repo) return;
    try {
      const client = await session.getClient(repo, roleRef.current);
      setDoc(await client.view(selected.id, "all"));
    } catch (/** @type {unknown} */ err) {
      setError(/** @type {Error} */ (err).message);
    } finally {
      setLoading(null);
    }
  }

  /**
   * Re-fetches the open document. Deliberately does not clear messages:
   * callers rely on notices/errors staying visible.
   */
  async function refreshDoc() {
    if (!doc || !repo) return;
    setLoading("refreshing…");
    try {
      const client = await session.getClient(repo, roleRef.current);
      setDoc(await client.view(doc.id, "all"));
    } catch (/** @type {unknown} */ err) {
      setError(/** @type {Error} */ (err).message);
    } finally {
      setLoading(null);
    }
  }

  /**
   * Runs a write operation against the open document with the given
   * identity role; on Not-allowed with the primary identity, offers a
   * retry with the secondary via a confirmation dialog.
   *
   * @param {(client: any) => Promise<any>} action - Performs the operation.
   * @param {{useRole: "primary"|"secondary", onSuccess: (client: any, result: any) => void}} options
   */
  async function performWrite(action, { useRole, onSuccess }) {
    if (!repo || !doc) return;
    clearMessages();
    setBusy(true);
    try {
      const client = await session.getClient(repo, useRole);
      const result = await action(client);
      onSuccess(client, result);
    } catch (err) {
      if (
        err instanceof WorkError &&
        err.status === Status.DISALLOWED &&
        useRole === "primary" &&
        session.identities.secondary
      ) {
        const secondaryHash = identityHashHex(session.identities.secondary);
        const isAuthor =
          (doc.meta?.author ?? "").toLowerCase() === secondaryHash;
        setConfirm({
          message:
            `✗ ${err.message}. ` +
            (isAuthor ? "The secondary (pi) identity is the author. " : "") +
            `Retry with the secondary (pi) identity ${secondaryHash.slice(0, 8)}…?`,
          action: () =>
            performWrite(action, { useRole: "secondary", onSuccess }),
        });
      } else {
        setError(/** @type {Error} */ (err).message);
      }
    } finally {
      setBusy(false);
    }
  }

  /**
   * Runs a lifecycle operation on the open document.
   * @param {"complete"|"activate"} op
   * @param {"primary"|"secondary"} [withRole]
   */
  function runLifecycle(op, withRole) {
    if (!doc) return;
    performWrite((client) => client[op](doc.id), {
      useRole: withRole ?? roleRef.current,
      onSuccess: async (client) => {
        setDoc(await client.view(doc.id, "all"));
        setNotice(
          `Document #${doc.id} ${op === "complete" ? "completed" : "activated"}`,
        );
        // Keep the list warm for when the user goes back.
        refreshDocs();
      },
    });
  }

  /**
   * Deletes the open document. The numeric ID becomes free for new
   * documents, so the list is re-fetched afterwards.
   * @param {"primary"|"secondary"} [withRole]
   */
  function deleteDoc(withRole) {
    if (!doc) return;
    const scope = doc.meta?.scope ?? doc.scope ?? "active";
    performWrite((client) => client.delete(doc.id, scope), {
      useRole: withRole ?? roleRef.current,
      onSuccess: () => {
        setNotice(
          `Document #${doc.id} deleted — its number may be reused by new documents`,
        );
        setDoc(null);
        setScreen("docs");
        refreshDocs();
      },
    });
  }

  /**
   * Opens the external editor for editing the document body or drafting an
   * update. The TUI suspends while the editor holds the terminal.
   * @param {"edit"|"update"} kind
   */
  function runEditorAction(kind) {
    if (!doc) return;
    clearMessages();
    setEditor({ kind });
  }

  /**
   * Applies the content returned by the external editor.
   * @param {string} content
   */
  function handleEditorDone(content) {
    const kind = editor?.kind;
    setEditor(null);
    if (!doc || !repo) return;
    if (kind === "edit") {
      if (content.trim() === (doc.content ?? "").trim()) {
        setNotice("Edit discarded — no changes");
        return;
      }
      performWrite(
        (client) =>
          client.edit(doc.id, content, { scope: doc.meta?.scope ?? "active" }),
        {
          useRole: roleRef.current,
          onSuccess: async (client) => {
            setDoc(await client.view(doc.id, "all"));
            setNotice(`Document #${doc.id} edited`);
            refreshDocs();
          },
        },
      );
    } else {
      if (!content.trim()) {
        setNotice("Update discarded — empty");
        return;
      }
      performWrite(
        (client) => client.update(doc.id, content, doc.meta?.scope ?? "active"),
        {
          useRole: roleRef.current,
          onSuccess: async (client, result) => {
            setDoc(await client.view(doc.id, "all"));
            setNotice(
              `Update #${result?.id ?? "?"} added to document #${doc.id}`,
            );
            refreshDocs();
          },
        },
      );
    }
  }

  // Global fatal screen: no usable identity.
  if (editor) {
    return h(
      Box,
      { flexDirection: "column", height: rows },
      h(EditorRunner, {
        editor,
        doc,
        onComplete: handleEditorDone,
      }),
    );
  }

  if (fatal) {
    return h(
      Box,
      { flexDirection: "column", height: rows, padding: 1 },
      h(ErrorBanner, { message: fatal }),
      h(Text, { dimColor: true }, "Press q to quit."),
    );
  }
  if (!ready) {
    return h(
      Box,
      { height: rows, padding: 1 },
      h(Spinner, { label: "loading identities…" }),
    );
  }

  const chrome = h(StatusBar, {
    error,
    busy: busy || loading !== null,
    busyLabel: loading ?? "working…",
    hints:
      screen === "repos"
        ? "→/Enter open · r rescan · q quit"
        : screen === "docs"
          ? "Enter open · r refresh · i identity · Esc back · q quit"
          : "←/q back · c/a/d/e/u actions · r refresh",
    identity: identityInfo,
    notice,
  });

  if (screen === "repos") {
    return h(
      Box,
      { flexDirection: "column", height: rows },
      h(
        Box,
        { flexDirection: "column", flexGrow: 1 },
        h(RepoScreen, {
          repos,
          startDir: process.cwd(),
          maxVisible: reposListMax,
          onSelect: selectRepo,
          onQuit: () => exit(),
          onRescan: rescan,
        }),
      ),
      chrome,
    );
  }

  if (screen === "docs") {
    return h(
      Box,
      { flexDirection: "column", height: rows },
      h(
        Box,
        { flexDirection: "column", flexGrow: 1 },
        h(DocListScreen, {
          repo: /** @type {RepoInfo} */ (repo),
          docs,
          maxVisible: docsListMax,
          onOpen: openDoc,
          onBack: () => {
            clearMessages();
            setScreen("repos");
          },
          onRefresh: refreshDocs,
          onSwitchIdentity: switchIdentity,
          identity: identityInfo ?? { role, hash: "" },
        }),
      ),
      chrome,
    );
  }

  // screen === "view"
  return h(
    Box,
    { flexDirection: "column", height: rows },
    h(
      Box,
      { flexDirection: "column", flexGrow: 1 },
      doc
        ? h(DocViewScreen, {
            doc,
            identity: identityInfo ?? { role, hash: "" },
            secondaryHash: session.identities.secondary
              ? identityHashHex(session.identities.secondary)
              : null,
            inputEnabled: !busy && !confirm,
            onAction: (op) =>
              setConfirm({
                message: `${op === "complete" ? "Complete" : "Activate"} document #${doc.id} ("${doc.meta?.title ?? "Untitled"}")?`,
                action: () => runLifecycle(op),
              }),
            onDelete: () =>
              setConfirm({
                message: `Delete ${doc.meta?.scope ?? "active"} document #${doc.id} ("${doc.meta?.title ?? "Untitled"}")? Its number may be reused by new documents.`,
                action: () => deleteDoc(),
              }),
            onEdit: () => runEditorAction("edit"),
            onUpdate: () => runEditorAction("update"),
            onBack: () => {
              clearMessages();
              setScreen("docs");
            },
            onRefresh: refreshDoc,
          })
        : h(ViewPlaceholder, {
            loading,
            error,
            onRetry: refreshDoc,
            onBack: () => {
              clearMessages();
              setScreen("docs");
            },
          }),
    ),
    confirm
      ? h(ConfirmDialog, {
          message: confirm.message,
          onConfirm: () => {
            const action = confirm.action;
            setConfirm(null);
            action();
          },
          onCancel: () => {
            setConfirm(null);
          },
        })
      : null,
    chrome,
  );
}

/**
 * Starts the TUI.
 * @returns {Promise<void>} Resolves when the app exits.
 */
export function run() {
  const session = createSession();
  // Run fullscreen: switch to the alternate screen buffer and restore the
  // previous terminal content on the way out.
  process.stdout.write("\x1b[?1049h\x1b[H\x1b[2J");
  process.on("exit", () => {
    process.stdout.write("\x1b[?1049l");
  });
  const instance = render(h(App, { session }), { exitOnCtrlC: true });
  return instance.waitUntilExit().then(async () => {
    await session.shutdown();
  });
}
