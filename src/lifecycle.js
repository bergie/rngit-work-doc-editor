/**
 * @file lifecycle.js
 *
 * Work-document lifecycle state machine.
 *
 * Valid transitions:
 *   proposed  → activate  (to active)
 *   active    → complete  (to completed)
 *   completed → activate  (re-activate, to active)
 *
 * Nothing else — apart from delete, which is allowed in every scope.
 * Note: deleted document IDs become free and can be reused by new documents.
 */

/** Scope → available lifecycle operations. */
export const TRANSITIONS = {
  active: ["complete"],
  proposed: ["activate"],
  completed: ["activate"],
};

/**
 * Returns the lifecycle operations available for a document in `scope`.
 * @param {string} [scope]
 * @returns {("complete"|"activate")[]}
 */
export function availableTransitions(scope) {
  return (
    (scope !== undefined &&
      /** @type {Record<string, ("complete"|"activate")[]>} */ (TRANSITIONS)[
        scope
      ]) ||
    []
  );
}

/**
 * Returns whether a transition is allowed from `scope`.
 * @param {string} scope
 * @param {"complete"|"activate"} operation
 * @returns {boolean}
 */
export function canTransition(scope, operation) {
  return availableTransitions(scope).includes(operation);
}
