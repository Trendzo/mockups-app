/**
 * Indian phone helpers. Numbers are entered nationally (10 digits, behind a
 * fixed +91 prefix in the UI) and sent to the API in +91 E.164 form.
 */

/** Normalise a user-typed Indian phone into +91 E.164 (e.g. "+919876543210"). */
export function toE164(input: string): string {
  let s = (input ?? '').trim().replace(/[\s-]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  s = s.replace(/\D/g, '');
  return s ? `+91${s}` : '';
}

/** Strip a leading +91 so a stored number displays cleanly behind a +91 prefix. */
export function nationalPhone(input: string): string {
  const s = (input ?? '').trim();
  return s.startsWith('+91') ? s.slice(3) : s;
}
