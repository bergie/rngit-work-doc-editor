/**
 * marked-terminal ships without type declarations; its API surface is a
 * single marked extension factory.
 */
declare module "marked-terminal" {
  /** @param {Record<string, any>} options
   *  @returns {any} marked extension */
  export function markedTerminal(options?: Record<string, any>): any;
}
