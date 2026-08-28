/**
 * firstAppLoginAt is the canonical proof that an account has used the app.
 * Keep admin labels, filters and totals tied to the timestamp so a stale
 * boolean can never disagree with the date shown in the View dialog.
 */
export function hasRecordedAppInstall(firstAppLoginAt: unknown): boolean {
  if (!firstAppLoginAt) return false;
  const timestamp = firstAppLoginAt instanceof Date
    ? firstAppLoginAt.getTime()
    : new Date(String(firstAppLoginAt)).getTime();
  return Number.isFinite(timestamp);
}
