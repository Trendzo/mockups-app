export interface Country {
  iso: string; // ISO-3166 alpha-2 (unique key)
  name: string;
  dial: string; // dial code without '+'
}

export const DEFAULT_ISO = 'IN';

/**
 * Curated country dial codes for the phone-OTP picker. Ordered alphabetically
 * by name; ISO is the unique select value (dial codes can repeat, e.g. +1).
 */
export const COUNTRIES: Country[] = [
  { iso: 'AU', name: 'Australia', dial: '61' },
  { iso: 'AT', name: 'Austria', dial: '43' },
  { iso: 'BD', name: 'Bangladesh', dial: '880' },
  { iso: 'BE', name: 'Belgium', dial: '32' },
  { iso: 'BR', name: 'Brazil', dial: '55' },
  { iso: 'CA', name: 'Canada', dial: '1' },
  { iso: 'CN', name: 'China', dial: '86' },
  { iso: 'DK', name: 'Denmark', dial: '45' },
  { iso: 'EG', name: 'Egypt', dial: '20' },
  { iso: 'FI', name: 'Finland', dial: '358' },
  { iso: 'FR', name: 'France', dial: '33' },
  { iso: 'DE', name: 'Germany', dial: '49' },
  { iso: 'GH', name: 'Ghana', dial: '233' },
  { iso: 'GR', name: 'Greece', dial: '30' },
  { iso: 'HK', name: 'Hong Kong', dial: '852' },
  { iso: 'ID', name: 'Indonesia', dial: '62' },
  { iso: 'IN', name: 'India', dial: '91' },
  { iso: 'IE', name: 'Ireland', dial: '353' },
  { iso: 'IL', name: 'Israel', dial: '972' },
  { iso: 'IT', name: 'Italy', dial: '39' },
  { iso: 'JP', name: 'Japan', dial: '81' },
  { iso: 'KE', name: 'Kenya', dial: '254' },
  { iso: 'KW', name: 'Kuwait', dial: '965' },
  { iso: 'MY', name: 'Malaysia', dial: '60' },
  { iso: 'MX', name: 'Mexico', dial: '52' },
  { iso: 'NP', name: 'Nepal', dial: '977' },
  { iso: 'NL', name: 'Netherlands', dial: '31' },
  { iso: 'NZ', name: 'New Zealand', dial: '64' },
  { iso: 'NG', name: 'Nigeria', dial: '234' },
  { iso: 'NO', name: 'Norway', dial: '47' },
  { iso: 'OM', name: 'Oman', dial: '968' },
  { iso: 'PK', name: 'Pakistan', dial: '92' },
  { iso: 'PH', name: 'Philippines', dial: '63' },
  { iso: 'PL', name: 'Poland', dial: '48' },
  { iso: 'PT', name: 'Portugal', dial: '351' },
  { iso: 'QA', name: 'Qatar', dial: '974' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966' },
  { iso: 'SG', name: 'Singapore', dial: '65' },
  { iso: 'ZA', name: 'South Africa', dial: '27' },
  { iso: 'KR', name: 'South Korea', dial: '82' },
  { iso: 'ES', name: 'Spain', dial: '34' },
  { iso: 'LK', name: 'Sri Lanka', dial: '94' },
  { iso: 'SE', name: 'Sweden', dial: '46' },
  { iso: 'CH', name: 'Switzerland', dial: '41' },
  { iso: 'TW', name: 'Taiwan', dial: '886' },
  { iso: 'TH', name: 'Thailand', dial: '66' },
  { iso: 'TR', name: 'Turkey', dial: '90' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971' },
  { iso: 'GB', name: 'United Kingdom', dial: '44' },
  { iso: 'US', name: 'United States', dial: '1' },
  { iso: 'VN', name: 'Vietnam', dial: '84' },
];
