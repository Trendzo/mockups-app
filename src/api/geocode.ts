/**
 * OpenStreetMap geocoding via Nominatim (no API key). Used by the store-address
 * location picker. Note Nominatim's usage policy: ≤1 req/sec, send an
 * identifying User-Agent, and cache/debounce — the picker debounces both search
 * and reverse lookups. For heavy production use, switch BASE to a self-hosted or
 * paid Nominatim instance.
 */

export interface GeoPlace {
  lat: number;
  lng: number;
  displayName: string;
  addressLine: string;
  pincode: string;
  city: string;
  state: string;
}

const BASE = 'https://nominatim.openstreetmap.org';
const HEADERS = {
  'User-Agent': 'TrendzoRetailer/1.0 (store onboarding)',
  Accept: 'application/json',
};

function composeAddressLine(a: Record<string, string>, displayName: string): string {
  const line = [
    [a.house_number, a.road].filter(Boolean).join(' '),
    a.neighbourhood || a.suburb || a.residential || a.quarter,
    a.city_district,
  ]
    .filter(Boolean)
    .join(', ');
  if (line) return line;
  // Fall back to the first couple of segments of the full display name.
  return displayName.split(',').slice(0, 2).join(', ').trim();
}

function toPlace(item: any): GeoPlace {
  const a = (item.address ?? {}) as Record<string, string>;
  const displayName = item.display_name ?? '';
  return {
    lat: Number(item.lat),
    lng: Number(item.lon),
    displayName,
    addressLine: composeAddressLine(a, displayName),
    pincode: a.postcode ?? '',
    city: a.city || a.town || a.village || a.county || '',
    state: a.state ?? '',
  };
}

/** Coordinates → address (map pin / current location). */
export async function reverseGeocode(lat: number, lng: number): Promise<GeoPlace | null> {
  const url = `${BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error('Location lookup failed');
  const data = await res.json();
  if (!data || data.error) return null;
  return toPlace(data);
}

/** Free-text query → matching places (address search). India-biased. */
export async function searchPlaces(query: string): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const url =
    `${BASE}/search?format=jsonv2&q=${encodeURIComponent(q)}` +
    '&addressdetails=1&limit=6&countrycodes=in';
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error('Search failed');
  const data = await res.json();
  return Array.isArray(data) ? data.map(toPlace) : [];
}
