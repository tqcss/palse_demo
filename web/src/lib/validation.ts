/** Basic RFC-ish email shape check for client-side validation. */
export function isEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value) && /^[^\s@]+$/.test(value.split("@")[1]);
}

/**
 * PRC license number shape: 6-9 digits (Philippine Regulation Commission
 * format). Digits only — separators like dashes are rejected, matching the
 * database-side `is_valid_prc()` helper.
 */
export function isPrcFormat(value: string): boolean {
  return /^[0-9]{6,9}$/.test(value.trim());
}
