/** Map ISO 3166-1 alpha-2 codes to HERE API country codes (alpha-3). */
const HERE_COUNTRY_CODES: Record<string, string> = {
  US: 'USA',
  GB: 'GBR',
  FR: 'FRA',
  DE: 'DEU',
  JP: 'JPN',
  AU: 'AUS',
  CA: 'CAN',
  SG: 'SGP',
  AE: 'ARE',
  IN: 'IND',
  BR: 'BRA',
};

export function toHereCountryCode(iso2: string): string {
  const key = iso2.trim().toUpperCase();
  return HERE_COUNTRY_CODES[key] ?? key;
}
