/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * What kind of build is running. A production build holds real student records, so it only
 * ever talks to the server it was built for: it never falls back to storing records in the
 * browser, and the connection cannot be re-pointed from the interface. Browser storage and
 * the runtime connection form exist for development and tests only.
 */
export const BROWSER_STORAGE_ALLOWED: boolean = !import.meta.env.PROD;
