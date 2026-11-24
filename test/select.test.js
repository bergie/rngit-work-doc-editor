import assert from "node:assert/strict";
import { test } from "node:test";
import { findInitialIndex } from "../src/tui/select.js";

/** @param {number[]} ids */
const items = (ids) => ids.map((id) => ({ label: `#${id}`, value: { id } }));
const byId = (/** @type {{value: {id: number}}} */ item) =>
  String(item.value.id);

test("findInitialIndex places the cursor on the matching item", () => {
  assert.equal(findInitialIndex(items([1, 2, 3]), byId, "2"), 1);
});

test("findInitialIndex works with the default value key", () => {
  const list = [
    { label: "a", value: "x" },
    { label: "b", value: "y" },
  ];
  assert.equal(
    findInitialIndex(list, (item) => item.value ?? item, "y"),
    1,
  );
});

test("findInitialIndex returns -1 when the item is gone", () => {
  assert.equal(findInitialIndex(items([1, 2, 3]), byId, "9"), -1);
});

test("findInitialIndex returns -1 for an empty list", () => {
  assert.equal(findInitialIndex([], byId, "1"), -1);
});

test("findInitialIndex returns -1 without an initial key", () => {
  assert.equal(findInitialIndex(items([1, 2]), byId, null), -1);
  assert.equal(findInitialIndex(items([1, 2]), byId, undefined), -1);
});
