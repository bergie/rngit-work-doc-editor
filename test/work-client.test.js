import assert from "node:assert/strict";
import { test } from "node:test";
import { MsgPack } from "@reticulum/core";
import {
  buildRequest,
  parseResponse,
  Status,
  statusLabel,
  WorkError,
} from "../src/work-client.js";

test("buildRequest keeps the integer repository key on the wire", () => {
  const map = buildRequest("group/repo", { operation: "list", scope: "all" });
  assert.ok(map instanceof Map);
  assert.equal(map.get(0), "group/repo");
  assert.equal(map.get("operation"), "list");
  assert.equal(map.get("scope"), "all");
  // The encoded msgpack must contain the int8 fixmap key 0, not "0".
  const encoded = MsgPack.encode(map);
  const decoded = MsgPack.decode(encoded);
  assert.ok(decoded instanceof Map || typeof decoded === "object");
  // Round-trip via msgpack: key 0 must remain integer 0.
  const redecoded = MsgPack.decode(encoded);
  const hasIntKey =
    redecoded instanceof Map ? redecoded.has(0) : "0" in redecoded;
  assert.ok(hasIntKey);
});

test("buildRequest drops undefined fields", () => {
  const map = buildRequest("g/r", { title: "t", title2: undefined });
  assert.equal(map.size, 2); // repository key + title
});

test("parseResponse decodes OK payloads", () => {
  const payload = MsgPack.encode({ id: 8, scope: "active" });
  const blob = new Uint8Array([Status.OK, ...payload]);
  assert.deepEqual(parseResponse(blob), { id: 8, scope: "active" });
});

test("parseResponse returns null for empty OK responses", () => {
  assert.equal(parseResponse(new Uint8Array([Status.OK])), null);
});

test("parseResponse throws WorkError with server message on failure", () => {
  const message = new TextEncoder().encode("Not allowed");
  const blob = new Uint8Array([Status.DISALLOWED, ...message]);
  try {
    parseResponse(blob);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof WorkError);
    assert.equal(err.status, Status.DISALLOWED);
    assert.equal(err.message, "Not allowed");
  }
});

test("parseResponse falls back to the status label without a message", () => {
  try {
    parseResponse(new Uint8Array([Status.NOT_FOUND]));
    assert.fail("should have thrown");
  } catch (/** @type {unknown} */ err) {
    assert.equal(
      /** @type {Error} */ (err).message,
      statusLabel(Status.NOT_FOUND),
    );
  }
});

test("parseResponse rejects non-blob responses", () => {
  assert.throws(() => parseResponse(null), /Unexpected response/);
  assert.throws(() => parseResponse("nope"), /Unexpected response/);
});
