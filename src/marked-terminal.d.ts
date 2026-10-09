/**
 * marked-terminal ships without type declarations; its API surface is a
 * single marked extension factory.
 */
declare module "marked-terminal" {
  /**
   * @param {Record<string, unknown>} [options] - Renderer options.
   * @returns {any} marked extension
   */
  // biome-ignore lint/suspicious/noExplicitAny: the underlying renderer is untyped
  export function markedTerminal(options?: Record<string, unknown>): any;
}
