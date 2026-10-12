export interface SourceRef {
  file: string;
  folder?: string;
  page?: number;
  method: 'text' | 'vision' | 'excel' | 'rules' | 'computed';
  rawPrinted?: string;
  confidence?: number;
}

export type DomainType = 'GST' | 'Banking' | 'Financial' | 'KYC/other';

export type DocType =
  // GST
  | 'gstr3b'
  | 'gstr1'
  | 'gstr2b'
  | 'gst_certificate'
  | 'sales_invoice_einvoice'
  | 'purchase_invoice'
  | 'gst_status'
  // Banking
  | 'bank_statement'
  | 'loan_statement'
  | 'loan_obligation_sheet'
  // Financial
  | 'audited_fs'
  | 'tax_audit_3cd'
  | 'itr_ack'
  | 'tax_computation'
  | 'form_26as'
  | 'provisional_fs'
  | 'ledger_export'
  | 'debtor_ageing'
  | 'creditor_ageing'
  | 'cibil_company'
  | 'cibil_individual'
  | 'sanction_letter'
  | 'networth_certificate'
  // KYC / other
  | 'mca_master'
  | 'moa_aoa'
  | 'udyam'
  | 'lei'
  | 'rental_agreement'
  | 'shareholding'
  | 'business_profile'
  | 'id_document'
  | 'unknown';

export interface ProcessedFile {
  id: string;
  name: string;
  folderPath: string;
  size: number;
  mimeType: string;
  magicBytesType: string;
  pageCount: number;
  isEncrypted: boolean;
  unlockedPassword?: string;
  hasTextLayer: boolean;
  domain: DomainType;
  docType: DocType;
  confidence: number;
  status: 'pending' | 'processing' | 'completed' | 'error' | 'manual_review';
  error?: string;
  classificationReason?: string;
  extractedSnippet?: string;
}

export interface GstReturnRow {
  gstin: string;
  state: string;
  financialYear: string;
  period: string; // e.g. "2025-04" or "Apr 2025"
  arn: string;
  arnDate: string;
  taxable_3_1a: number;
  igst_3_1a: number;
  cgst_3_1a: number;
  sgst_3_1a: number;
  cess_3_1a: number;
  zeroRated_3_1b: number;
  nilExempt_3_1c: number;
  totalOutward: number;
  itcNet_igst: number;
  itcNet_cgst: number;
  itcNet_sgst: number;
  totalItcNet: number;
  exemptInward_table5: number;
  lateFee: number;
  interestPaid: number;
  filingDate?: string;
  dueDate?: string;
  isLate?: boolean;
  source: SourceRef;
}

export interface GstBuyerSupplier {
  name: string;
  gstin: string;
  state: string;
  amount: number;
  sharePercent: number;
  transactionCount: number;
  isRelatedParty?: boolean;
  source: SourceRef;
}

export interface BankTxn {
  id: string;
  bank: string;
  accountNumber: string;
  date: string;
  narration: string;
  withdrawalRaw: string;
  depositRaw: string;
  balanceRaw: string;
  // Computed & verified values:
  computedDirection: 'CR' | 'DR';
  computedAmount: number;
  verifiedBalance: number;
  deltaMismatch: boolean; // true if printed amount != balance delta by > 0.02
  isInternalTransfer?: boolean;
  isCashDeposit?: boolean;
  isBounceReturn?: boolean;
  isLoanEmi?: boolean;
  counterparty?: string;
  category?: 'Sales / Inflow' | 'Supplier / Outflow' | 'Internal Transfer' | 'Loan / EMI' | 'Cash' | 'Tax / Statutory' | 'Other';
  source: SourceRef;
}

export interface BankAccountSummary {
  bank: string;
  accountNumber: string;
  accountType: 'Current' | 'CC/OD' | 'Savings' | 'Escrow';
  sanctionedLimit?: number;
  periodStart: string;
  periodEnd: string;
  totalCredits: number;
  totalDebits: number;
  totalTurnoverClean: number; // Internal transfers stripped
  internalTransfersAmount: number;
  totalTxnCount: number;
  balanceContinuityPercent: number; // % of rows that mathematically balanced
  cashDepositsAmount: number;
  bouncesCount: number;
  avgMonthlyBalance: number;
  closingBalanceAsOfMarch31: number;
  source: SourceRef;
}

export interface BankMonthlyAggregate {
  month: string; // e.g. "2025-04"
  accountNumber: string;
  bank: string;
  openingBalance: number;
  closingBalance: number;
  inflowTotal: number;
  outflowTotal: number;
  cleanTurnover: number;
  minBalance: number;
  avgBalance: number;
  maxUtilizationPercent?: number; // for CC/OD
  bouncesCount: number;
}

export interface FsLine {
  statement: 'PL' | 'BS' | 'NOTE';
  standardKey: string;
  label: string;
  isSubtotal?: boolean;
  values: Record<string, number>; // FY label -> number (e.g. { "FY24": 1040600000, "FY25": 1730000000 })
  source: SourceRef;
  confidence: number;
}

export interface FinancialRatioItem {
  id: number;
  name: string;
  category: 'Profitability' | 'Solvency & Leverage' | 'Coverage' | 'Liquidity' | 'Working Capital' | 'Banking & Turnover';
  formula: string;
  benchmark: string;
  fyValues: Record<string, number | null>; // e.g. { "FY24": 1.45, "FY25": 1.82, "FY26": 2.10 }
  unit: 'x' | '%' | 'days' | '₹ Cr' | 'score';
  status: 'HEALTHY' | 'MODERATE' | 'CRITICAL';
  interpretation: string;
}

export interface ValidationCheckItem {
  id: string;
  name: string;
  category: 'Banking Continuity' | 'GST vs Audited' | 'Ledger vs Statements' | 'Debtors / Creditors' | 'Loan Covenants' | 'Identity Consistency' | 'Arithmetic Sums';
  status: 'PASS' | 'WARN' | 'FAIL';
  expected: string;
  actual: string;
  variance?: string;
  evidence: string;
  sourceRef: SourceRef;
  description: string;
}

export interface AnomalyFlagItem {
  id: string;
  title: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'Pass-Through' | 'Turnover Churning' | 'Margin & Sales' | 'Related Party' | 'Leverage' | 'Receivables Ageing' | 'Credit Report' | 'Compliance';
  plainDescription: string;
  supportingNumbers: string;
  sourceRefs: SourceRef[];
  suggestedMitigation: string;
}

export interface SwotData {
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  executiveVerdict: string;
}

export interface CompanyMetadata {
  name: string;
  cin: string;
  pan: string;
  gstinList: string[];
  fyYears: string[];
  directorNames: string[];
  registeredAddress: string;
  industry: string;
  sanctionedFacilities?: {
    bank: string;
    type: string;
    sanctionedAmount: number; // in INR
    covenants: string[];
  }[];
}

export interface CddDataset {
  company: CompanyMetadata;
  files: ProcessedFile[];
  gstReturns: GstReturnRow[];
  gstBuyers: GstBuyerSupplier[];
  gstSuppliers: GstBuyerSupplier[];
  bankAccounts: BankAccountSummary[];
  bankMonthly: BankMonthlyAggregate[];
  bankTransactions: BankTxn[];
  plLines: FsLine[];
  bsLines: FsLine[];
  ratios: FinancialRatioItem[];
  validations: ValidationCheckItem[];
  flags: AnomalyFlagItem[];
  swot: SwotData;
  sourceMap: SourceRef[];
}
