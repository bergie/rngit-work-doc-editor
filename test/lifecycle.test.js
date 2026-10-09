import assert from "node:assert/strict";
import { test } from "node:test";
import { availableTransitions, canTransition } from "../src/lifecycle.js";

test("active documents can only be completed", () => {
  assert.deepEqual(availableTransitions("active"), ["complete"]);
  assert.ok(canTransition("active", "complete"));
  assert.ok(!canTransition("active", "activate"));
});

test("proposed documents can only be activated", () => {
  assert.deepEqual(availableTransitions("proposed"), ["activate"]);
  assert.ok(canTransition("proposed", "activate"));
  assert.ok(!canTransition("proposed", "complete"));
});

test("completed documents can only be re-activated", () => {
  assert.deepEqual(availableTransitions("completed"), ["activate"]);
  assert.ok(canTransition("completed", "activate"));
  assert.ok(!canTransition("completed", "complete"));
});

test("unknown scopes allow no transitions", () => {
  assert.deepEqual(availableTransitions(undefined), []);
  assert.deepEqual(availableTransitions("weird"), []);
});
