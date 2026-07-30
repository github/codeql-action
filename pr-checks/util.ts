/**
 * Returns an appropriate message for the error.
 *
 * If the error is an `Error` instance, this returns the error message without
 * an `Error: ` prefix.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
