import { ScreenerCompanyData } from '../types/screener.ts';

export const NOT_AVAILABLE = 'Not available';

// 21-character Corporate Identification Number, e.g. L22210MH1995PLC084781
export const CIN_REGEX = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;

// Returns the normalized CIN if the input is one (spaces trimmed, case-insensitive), else null
export function parseCin(input: string): string | null {
  const normalized = (input || '').replace(/\s+/g, '').toUpperCase();
  return CIN_REGEX.test(normalized) ? normalized : null;
}

// Mandatory first line of every company report
export function buildCompanyHeaderLine(
  company: Pick<ScreenerCompanyData, 'name' | 'cin' | 'nseCode' | 'bseCode'>
): string {
  return `Company: ${company.name || NOT_AVAILABLE} | CIN: ${company.cin || NOT_AVAILABLE} | NSE: ${
    company.nseCode || NOT_AVAILABLE
  } | BSE: ${company.bseCode || NOT_AVAILABLE}`;
}
