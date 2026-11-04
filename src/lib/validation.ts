/**
 * Field validators shared by onboarding and the dashboard's "Add farm" popup.
 *
 * They live here rather than in either screen because the two collect the same
 * farm details, and a rule that exists in only one of them is a rule a farmer
 * can walk around by using the other door.
 *
 * Every validator returns `null` when the value is acceptable and a
 * farmer-facing message when it is not — so callers can render the message
 * directly without translating a boolean into words at each call site.
 */

/** The message the farmer sees when a number field contains anything but a number. */
export const INVALID_NUMBER_MSG = "Invalid character found — please enter a valid number.";

/**
 * Phone must be exactly ten digits.
 *
 * Indian mobile numbers are ten digits, and the field is the only handle we have
 * on a farmer if an alert has to reach them. Spaces, dashes and a leading +91 are
 * stripped before checking, because farmers type all three and rejecting the
 * formatting rather than the number is just noise.
 */
export function validatePhone(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Phone number is required.";

  const stripped = value.replace(/[\s\-()]/g, "").replace(/^\+?91/, "");

  if (/[^\d]/.test(stripped)) return "Phone number must contain digits only.";
  if (stripped.length !== 10) return "Phone number must be exactly 10 digits.";
  return null;
}

/** The ten digits behind whatever the farmer typed, for storage. */
export function normalizePhone(raw: string): string {
  return raw.trim().replace(/[\s\-()]/g, "").replace(/^\+?91/, "");
}

/** Shown for every malformed address, in every form. One rule, one wording. */
export const INVALID_EMAIL_MSG =
  "Please enter a valid email address (e.g., name@domain.com).";

/**
 * A structurally valid address: `local-part@domain.tld`, any provider.
 *
 * Built from two halves so each rejection is a property of the grammar rather
 * than a special case bolted on:
 *
 *   local   one or more dot-separated atoms. Because the dot must *join* two
 *           atoms, this rejects a leading dot, a trailing dot and the doubled
 *           dot in "farmer..name@domain.com" without testing for them.
 *   domain  one or more labels, each starting and ending alphanumeric so a
 *           label cannot lead or trail a hyphen, then a TLD of two or more
 *           letters. The mandatory trailing `.tld` is what rejects
 *           "farmer@domain"; requiring a non-empty label before every dot is
 *           what rejects "farmer@.com" and "farmer@domain.".
 *
 * The atom set is the RFC 5322 dot-atom list, so "+" tagging, "_" and the rest
 * of the unusual-but-legal characters keep working — refusing a deliverable
 * address is a worse failure than accepting an odd-looking one. Quoted local
 * parts ("a b"@x.com), bare IP-literal domains and Unicode domains are the
 * knowing omissions: all three are vanishingly rare and each one widens the
 * grammar far more than it helps.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/**
 * Validates an email address. Returns null when it is acceptable.
 *
 * Surrounding whitespace is ignored (people paste addresses with it), but the
 * address itself is never rewritten — no lower-casing, no stripping of dots or
 * "+" tags. Callers store exactly what the user typed, minus the padding.
 *
 * The RFC 5321 length caps are enforced too: a 300-character local part matches
 * the grammar happily and is still not a real address.
 */
export function validateEmail(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "Email is required.";
  if (value.length > 254) return INVALID_EMAIL_MSG;

  const at = value.lastIndexOf("@");
  if (at > 64) return INVALID_EMAIL_MSG;

  return EMAIL_RE.test(value) ? null : INVALID_EMAIL_MSG;
}

/** The address as it should be stored: the user's own text, padding removed. */
export function normalizeEmail(raw: string): string {
  return raw.trim();
}

/**
 * An area in acres: a positive number, nothing else.
 *
 * The two failure modes are deliberately separate messages. A "-" or a stray
 * letter is a typo and the farmer needs to know a character is wrong; "0" is
 * well-formed but not a farm, and telling them to "enter a valid number" there
 * would be confusing because they did.
 */
export function validateArea(raw: string, label = "Area"): string | null {
  const value = raw.trim();
  if (!value) return `${label} is required.`;

  // Digits with at most one decimal point. This rejects "-", "+", "e", "1-2"
  // and "1.2.3" — all of which Number() would either accept or quietly coerce.
  if (!/^\d*\.?\d+$/.test(value)) return INVALID_NUMBER_MSG;

  const n = Number(value);
  if (!Number.isFinite(n)) return INVALID_NUMBER_MSG;
  if (n <= 0) return `${label} must be greater than 0.`;
  return null;
}
