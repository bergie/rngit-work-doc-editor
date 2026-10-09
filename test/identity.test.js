import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  identityFromKeyBytes,
  identityHashHex,
  loadIdentityFile,
} from "../src/identity.js";

/** Deterministic 64-byte key blob: 32 zero-ish x25519 + 32 ed25519 bytes. */
const PRIVATE_64 = new Uint8Array(64).fill(7);
const PRIVATE_128 = new Uint8Array(128).fill(9);
PRIVATE_128.set(PRIVATE_64, 0);

test("identityFromKeyBytes accepts a 64-byte private blob and derives keys", async () => {
  const identity = await identityFromKeyBytes(new Uint8Array(PRIVATE_64));
  assert.ok(identity);
  const hash = identityHashHex(identity);
  assert.match(hash, /^[0-9a-f]{32}$/);
  // Public key material must have been derived.
  const pub = await identity.getPublicKey();
  assert.equal(pub.length, 64);
  assert.ok(pub.some((b) => b !== 0));
});

test("identityFromKeyBytes accepts a 128-byte private+public export", async () => {
  const identity = await identityFromKeyBytes(new Uint8Array(PRIVATE_128));
  assert.ok(identity);
  assert.match(identityHashHex(identity), /^[0-9a-f]{32}$/);
});

test("identityFromKeyBytes rejects other lengths", async () => {
  assert.equal(await identityFromKeyBytes(new Uint8Array(32)), null);
  assert.equal(await identityFromKeyBytes(new Uint8Array(65)), null);
});

test("loadIdentityFile loads a 64-byte file and reports a stable hash", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ident-"));
  const path = join(dir, "identity.key");
  writeFileSync(path, PRIVATE_64);
  const identity = await loadIdentityFile(path, "Test");
  if (!identity) throw new Error("identity failed to load");
  const hash = identityHashHex(identity);
  const again = await loadIdentityFile(path, "Test");
  if (!again) throw new Error("identity failed to load on reload");
  assert.equal(identityHashHex(again), hash);
});

test("loadIdentityFile returns null for missing files", async () => {
  const missing = join(tmpdir(), `ident-missing-${Date.now()}`, "identity.key");
  assert.equal(await loadIdentityFile(missing, "Test"), null);
});

test("loadIdentityFile rejects unusable key material", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ident-"));
  const path = join(dir, "identity.key");
  writeFileSync(path, new Uint8Array(10).fill(1));
  await assert.rejects(() => loadIdentityFile(path, "Test"), /10 bytes/);
});
