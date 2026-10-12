/**
 * CDD Deterministic Parsers & Normalizers
 * All parsing is executed in deterministic TypeScript code - NEVER guessed by an LLM.
 */

/**
 * Parses Indian currency strings into standard numbers.
 * Supports:
 * - Indian comma format: 1,23,45,678.00
 * - Negative bracket notation: (12,345.50)
 * - Negative prefix: -12,345.50
 * - Dr / Cr suffixes: 45,000 Dr or 45,000 Cr
 * - Lakhs / Crores suffixes: 12.5 Cr, 45.2 Lakhs
 */
export function parseIndianNumber(val: string | number | null | undefined, defaultVal = 0): number {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;

  let str = String(val).trim();
  if (!str || str === '-' || str === 'NA' || str === 'N/A' || str === 'nil' || str === 'Nil') {
    return defaultVal;
  }

  // Check if negative in brackets e.g. (1,234.50)
  let isNegative = false;
  if (/^\(.*\)$/.test(str)) {
    isNegative = true;
    str = str.slice(1, -1).trim();
  } else if (str.startsWith('-')) {
    isNegative = true;
    str = str.substring(1).trim();
  }

  // Handle Dr / Cr suffix
  if (/Cr$/i.test(str) && !/Crore/i.test(str)) {
    // Check if it's accounting Cr (credit) vs Crores
    if (/\b(?:Dr|DR)\b/i.test(str)) {
      isNegative = true;
      str = str.replace(/\b(?:Dr|DR)\b/i, '');
    }
  } else if (/\b(?:Dr|DR)\b/i.test(str)) {
    isNegative = true;
    str = str.replace(/\b(?:Dr|DR)\b/i, '');
  }

  // Multiplier for Lakhs / Crores
  let multiplier = 1;
  if (/\b(?:Crores?|Cr\.?)\b/i.test(str)) {
    multiplier = 10000000;
    str = str.replace(/\b(?:Crores?|Cr\.?)\b/i, '');
  } else if (/\b(?:Lakhs?|Lacs?|L\.?)\b/i.test(str)) {
    multiplier = 100000;
    str = str.replace(/\b(?:Lakhs?|Lacs?|L\.?)\b/i, '');
  } else if (/\b(?:Thousands?|K)\b/i.test(str)) {
    multiplier = 1000;
    str = str.replace(/\b(?:Thousands?|K)\b/i, '');
  }

  // Remove currency signs (₹, Rs, INR, $), commas, whitespace
  str = str.replace(/[₹$]|Rs\.?|INR|,|\s/gi, '');

  const num = parseFloat(str);
  if (isNaN(num)) return defaultVal;

  const result = (isNegative ? -num : num) * multiplier;
  return Math.round(result * 100) / 100;
}

/**
 * Formats a number to Indian currency representation (e.g. ₹ 1,23,45,678)
 */
export function formatIndianCurrency(val: number | null | undefined, inCrores = false): string {
  if (val === null || val === undefined || isNaN(val)) return '₹ 0.00';
  if (inCrores || Math.abs(val) >= 10000000) {
    const cr = val / 10000000;
    return `₹ ${cr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
  }
  return `₹ ${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Compact Indian currency formatting for tables & charts
 */
export function formatCompactCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '₹ 0';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 10000000) {
    return `${sign}₹${(abs / 10000000).toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    return `${sign}₹${(abs / 100000).toFixed(2)} L`;
  }
  if (abs >= 1000) {
    return `${sign}₹${(abs / 1000).toFixed(1)} K`;
  }
  return `${sign}₹${abs.toFixed(0)}`;
}

/**
 * Formats a ratio value with unit
 */
export function formatRatio(val: number | null | undefined, unit: 'x' | '%' | 'days' | '₹ Cr' | 'score' = 'x'): string {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  if (unit === '%') return `${val.toFixed(2)}%`;
  if (unit === 'x') return `${val.toFixed(2)}x`;
  if (unit === 'days') return `${Math.round(val)} days`;
  if (unit === '₹ Cr') return `₹ ${val.toFixed(2)} Cr`;
  return val.toFixed(1);
}

/**
 * Standardizes bank & invoice dates to YYYY-MM-DD
 * Handles: DD/MM/YYYY, DD-MM-YYYY, DD-Mon-YYYY, YYYY-MM-DD
 */
export function normalizeDate(dateStr: string): string {
  if (!dateStr) return '';
  const str = dateStr.trim();

  // Match YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // Match DD/MM/YYYY or DD-MM-YYYY
  const numMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numMatch) {
    const d = numMatch[1].padStart(2, '0');
    const m = numMatch[2].padStart(2, '0');
    let y = numMatch[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }

  // Match DD-Mon-YYYY e.g. 15-Apr-2025 or 15 Apr 2025
  const monthMap: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };
  const textMatch = str.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ](\d{2,4})$/);
  if (textMatch) {
    const d = textMatch[1].padStart(2, '0');
    const m = monthMap[textMatch[2].toLowerCase()] || '01';
    let y = textMatch[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m}-${d}`;
  }

  // Fallback to Date parser
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return str;
}

/**
 * Counterparty normalizer:
 * Strips payment channel prefixes (NEFT, RTGS, IMPS, UPI, CMS, INB),
 * IFSC codes, trailing reference numbers, and card masks.
 */
export function cleanCounterparty(narration: string): { cleanName: string; channel: string } {
  if (!narration) return { cleanName: 'UNKNOWN', channel: 'OTHER' };

  let text = narration.trim();
  let channel = 'OTHER';

  if (/^UPI/i.test(text)) channel = 'UPI';
  else if (/^NEFT/i.test(text)) channel = 'NEFT';
  else if (/^RTGS/i.test(text)) channel = 'RTGS';
  else if (/^IMPS/i.test(text)) channel = 'IMPS';
  else if (/^CMS/i.test(text)) channel = 'CMS';
  else if (/^INB|INTERNET BANKING/i.test(text)) channel = 'NETBANKING';
  else if (/CHQ|CHEQUE/i.test(text)) channel = 'CHEQUE';
  else if (/CASH/i.test(text)) channel = 'CASH';

  // Strip standard prefixes
  text = text.replace(/^(?:NEFT|RTGS|IMPS|UPI|CMS|INB|BIL|TPT|EFT)[-/:\s]+/i, '');
  // Strip IFSC code patterns (4 letters + 0 + 6 digits/letters e.g. YESB0000001, HDFC0001234)
  text = text.replace(/[A-Z]{4}0[A-Z0-9]{6}/gi, '');
  // Strip long numeric reference codes
  text = text.replace(/(?:REF|UTR|TXN|NO|CHQ)[-:\s]*\d+/gi, '');
  // Strip trailing pure numeric chunks
  text = text.replace(/\b\d{8,}\b/g, '');
  // Strip punctuation and multiple spaces
  text = text.replace(/[/\\_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  // If text starts with party separator like "CR TO" or "DR FROM"
  text = text.replace(/^(?:CR TO|DR FROM|TRANSFER TO|TRANSFER FROM|TO|BY)\s+/i, '');

  return {
    cleanName: text.toUpperCase().slice(0, 50) || 'COUNTERPARTY',
    channel,
  };
}

/**
 * Detects real file format using magic byte signatures
 */
export function detectMagicBytes(bytes: Uint8Array): { type: string; ext: string } {
  if (bytes.length < 4) return { type: 'unknown', ext: 'bin' };

  // %PDF -> PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return { type: 'application/pdf', ext: 'pdf' };
  }

  // PK\x03\x04 -> ZIP, XLSX, DOCX
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return { type: 'application/zip', ext: 'zip' };
  }

  // \xD0\xCF\x11\xE0 -> Legacy Microsoft Office (XLS, DOC)
  if (bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
    return { type: 'application/vnd.ms-excel', ext: 'xls' };
  }

  // JPEG
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return { type: 'image/jpeg', ext: 'jpg' };
  }

  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return { type: 'image/png', ext: 'png' };
  }

  return { type: 'application/octet-stream', ext: 'bin' };
}

/**
 * Searches for embedded passwords in file paths or names matching
 * patterns like `pass-<digits>`, `pass - <digits>`, `pwd-<digits>`, `pass<digits>`
 */
export function findPasswordInName(pathOrName: string): string | null {
  if (!pathOrName) return null;
  const match = pathOrName.match(/(?:pass|pwd|password)[\s_-]*([0-9a-zA-Z@$!#]+)/i);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}
