/**
 * Indian GST state codes (the 2 digits a GSTIN starts with), keyed by
 * state/UT name as returned by geocoders (OSM/Nominatim). Used to auto-fill
 * the application's stateCode when the GSTIN alone can't provide it.
 */
const GST_STATE_CODES: Record<string, string> = {
  'jammu and kashmir': '01',
  'himachal pradesh': '02',
  punjab: '03',
  chandigarh: '04',
  uttarakhand: '05',
  haryana: '06',
  delhi: '07',
  rajasthan: '08',
  'uttar pradesh': '09',
  bihar: '10',
  sikkim: '11',
  'arunachal pradesh': '12',
  nagaland: '13',
  manipur: '14',
  mizoram: '15',
  tripura: '16',
  meghalaya: '17',
  assam: '18',
  'west bengal': '19',
  jharkhand: '20',
  odisha: '21',
  chhattisgarh: '22',
  'madhya pradesh': '23',
  gujarat: '24',
  'daman and diu': '25',
  'dadra and nagar haveli': '26',
  'dadra and nagar haveli and daman and diu': '26',
  maharashtra: '27',
  karnataka: '29',
  goa: '30',
  lakshadweep: '31',
  kerala: '32',
  'tamil nadu': '33',
  puducherry: '34',
  pondicherry: '34',
  'andaman and nicobar islands': '35',
  telangana: '36',
  'andhra pradesh': '37',
  ladakh: '38',
};

/** GST state code for a state/UT name (e.g. "Maharashtra" → "27"). */
export function gstStateCode(stateName?: string | null): string | undefined {
  if (!stateName) return undefined;
  return GST_STATE_CODES[stateName.trim().toLowerCase()];
}

/** True when `code` is a plausible 2-digit GST state code. */
export function isGstStateCode(code?: string | null): boolean {
  return !!code && /^\d{2}$/.test(code.trim());
}
