/**
 * Races a promise against a timeout. Rejects with an Error if the timeout fires first.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message = "Operation timed out"): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
