/**
 * Nominatim (OpenStreetMap) forward and reverse geocoding — the same service
 * the web app's MapSelector uses, so a farmer who registers on the phone and
 * one who registers on the website end up with address strings written by the
 * same source.
 *
 * Nominatim's usage policy requires an identifying User-Agent/Referer on every
 * call. The browser sets one for the web app automatically; React Native does
 * not, so it is set explicitly here. (The web app additionally proxies these
 * calls through /api/geocode because its CSP forbids talking to third-party
 * hosts from the page; native has no such restriction and calls directly.)
 */

export type SelectedLocation = {
  lat: number;
  lng: number;
  address?: string;
  /** 6-digit Indian PIN code, when OSM knows one for the spot. */
  pincode?: string;
};

const NOMINATIM = "https://nominatim.openstreetmap.org";
const HEADERS = {
  Accept: "application/json",
  "User-Agent": "FasalSaarthi-Mobile/1.0",
};

/** India's geographic centre — where the picker opens before anything is known. */
export const INDIA_CENTER: SelectedLocation = { lat: 20.5937, lng: 78.9629 };

const PIN_RE = /^\d{6}$/;

/** A 6-digit PIN out of an OSM `address` object, if it looks like one. */
function readPostcode(address: unknown): string | undefined {
  const raw = (address as { postcode?: unknown } | null)?.postcode;
  if (typeof raw !== "string") return undefined;
  // OSM postcodes are occasionally written "560 001" or as a range.
  const digits = raw.replace(/\s+/g, "");
  return PIN_RE.test(digits) ? digits : undefined;
}

/** Address and PIN for a coordinate. Fields are omitted when unknown. */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ address?: string; pincode?: string }> {
  try {
    const res = await fetch(
      `${NOMINATIM}/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`,
      { headers: HEADERS, signal: AbortSignal.timeout(12000) }
    );
    const data = await res.json();
    return {
      address: (data?.display_name as string) || undefined,
      pincode: readPostcode(data?.address),
    };
  } catch {
    return {};
  }
}

/**
 * Best match for a place name, or null when nothing matches.
 *
 * A bare 6-digit query is a PIN code, and Nominatim answers those far more
 * reliably through its structured `postalcode` field than through free text —
 * so that is tried first, with the free-text form kept as a fallback. Mirrors
 * the web app's /api/geocode.
 */
export async function geocode(query: string): Promise<SelectedLocation | null> {
  const q = query.trim();
  if (!q) return null;

  const attempts = PIN_RE.test(q)
    ? [`postalcode=${encodeURIComponent(q)}&country=India`, `q=${encodeURIComponent(`${q} India`)}`]
    : [`q=${encodeURIComponent(q)}`];

  for (const params of attempts) {
    try {
      const res = await fetch(
        `${NOMINATIM}/search?format=json&addressdetails=1&limit=1&${params}`,
        { headers: HEADERS, signal: AbortSignal.timeout(12000) }
      );
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      const first = data[0];
      return {
        lat: parseFloat(first.lat),
        lng: parseFloat(first.lon),
        address: first.display_name as string,
        // A PIN search already knows its own PIN even if OSM omits it.
        pincode: readPostcode(first.address) ?? (PIN_RE.test(q) ? q : undefined),
      };
    } catch {
      /* try the next form */
    }
  }

  return null;
}

/** The label shown for a location — its address, or its coordinates if unnamed. */
export function locationLabel(loc?: SelectedLocation): string {
  if (!loc) return "";
  return loc.address ?? `Lat ${loc.lat.toFixed(4)}, Lng ${loc.lng.toFixed(4)}`;
}
