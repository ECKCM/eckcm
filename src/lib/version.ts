/**
 * Kiosk display version.
 *
 * Bump this by 0.10 in every PR that ships a kiosk change, then commit the
 * bump alongside the change. Shown to the left of the "Started …" label on the
 * check-in kiosk session strip so operators can tell at a glance which build a
 * given iPad is running. Format: `v1.10`, `v1.20`, …
 *
 * This is intentionally separate from package.json's npm `version` (which
 * follows semver for the package itself).
 */
export const KIOSK_VERSION = 1.1;

/** Formatted for display, e.g. "v1.10". */
export const KIOSK_VERSION_LABEL = `v${KIOSK_VERSION.toFixed(2)}`;
