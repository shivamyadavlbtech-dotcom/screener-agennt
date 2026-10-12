export interface TopRatio {
  name: string;
  value: string;
  rawNumber?: number;
  unit?: string;
}

export interface TableRow {
  label: string;
  values: (number | string | null)[];
  isHighlight?: boolean;
  isExpandable?: boolean;
  scheduleParent?: string;
  scheduleSection?: string;
  subRows?: TableRow[];
}

export interface TableData {
  title?: string;
  headers: string[];
  rows: TableRow[];
}

export interface GrowthRangeItem {
  label: string;
  value: string;
}

export interface GrowthRange {
  title: string;
  items: GrowthRangeItem[];
}

export interface PeerRow {
  sNo?: string;
  name: string;
  cmp?: number | string;
  pe?: number | string;
  marketCap?: number | string;
  dividendYield?: number | string;
  netProfitQtr?: number | string;
  profitVarQtr?: number | string;
  salesQtr?: number | string;
  salesVarQtr?: number | string;
  roce?: number | string;
  [key: string]: any;
}

export interface PeersData {
  headers: string[];
  rows: PeerRow[];
}

export interface DocumentItem {
  title: string;
  date?: string;
  agency?: string;
  type?: string;
  url: string;
}

export interface DocumentsSection {
  announcements: DocumentItem[];
  annualReports: DocumentItem[];
  creditRatings: DocumentItem[];
  concalls: DocumentItem[];
}

export interface FinancialSectionView {
  available: boolean;
  unitNotice?: string;
  quarters?: TableData;
  profitAndLoss?: TableData;
  growthRanges?: GrowthRange[];
  balanceSheet?: TableData;
  cashFlow?: TableData;
  ratios?: TableData;
  shareholdingQuarterly?: TableData;
  shareholdingYearly?: TableData;
}

export interface RequestLogEntry {
  timestamp: string;
  url: string;
  status: number | string;
  message: string;
  durationMs: number;
}

// Company record resolved from MCA-derived registries (ZaubaCorp, Tofler, web search)
export interface RegistryInfo {
  cin: string;
  name: string;
  listingStatus: string;
  companyStatus?: string;
  state?: string;
  incorporationYear?: string;
  source: string;
  sourceUrl: string;
}

export interface ScreenerCandidate {
  name: string;
  symbol: string;
  url: string;
}

export type CompanyLookupCode =
  | 'UNLISTED'
  | 'NOT_ON_SCREENER'
  | 'MULTIPLE_MATCHES'
  | 'CIN_UNRESOLVED';

// Error body returned by /api/company when a lookup cannot produce a Screener dossier
export interface CompanyLookupFailure {
  error: string;
  code?: CompanyLookupCode;
  cin?: string;
  registry?: RegistryInfo;
  candidates?: ScreenerCandidate[];
}

export interface ScreenerCompanyData {
  symbol: string;
  name: string;
  cin?: string;
  registry?: RegistryInfo;
  warehouseId?: string;
  companyId?: string;
  url: string;
  bseCode?: string;
  bseUrl?: string;
  nseCode?: string;
  nseUrl?: string;
  website?: string;
  sector?: string;
  industry?: string;
  about?: string;
  topRatios: TopRatio[];
  pros: string[];
  cons: string[];
  peers?: PeersData;
  consolidated?: FinancialSectionView;
  standalone?: FinancialSectionView;
  documents: DocumentsSection;
  aiSummary?: string;
  requestLogs: RequestLogEntry[];
}
