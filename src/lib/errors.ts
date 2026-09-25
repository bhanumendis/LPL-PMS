/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Runtime error handling. People see a short reference, never an exception message, stack
 * or database text; the console (and the API's own log, when the reference is a request id)
 * carries the detail under the same reference, so a support call can find it.
 */

/** A short, readable reference such as "E-4K9Q2M". */
export function errorReference(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return "E-" + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** Records an error under a fresh reference and returns the reference for display. */
export function reportError(error: unknown, where: string): string {
  const ref = errorReference();
  console.error(`[${ref}] ${where}`, error);
  return ref;
}

let installed = false;

/** Uncaught errors and rejected promises are logged under a reference instead of vanishing. */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => { reportError(e.error ?? e.message, "uncaught error"); });
  window.addEventListener("unhandledrejection", (e) => { reportError(e.reason, "unhandled promise rejection"); });
}
