/**
 * Configurable CDD Template JSON
 * Allows credit risk teams to customize benchmark thresholds,
 * sheet layouts, and validation rules without changing application code.
 */

export interface CddTemplateConfig {
  templateName: string;
  version: string;
  lastUpdated: string;
  reportingCurrency: 'INR' | 'USD';
  defaultScale: 'Crores' | 'Lakhs' | 'Actuals';
  benchmarks: {
    minDscr: number;
    maxTolTnw: number;
    maxDebtToEquity: number;
    minCurrentRatio: number;
    minQuickRatio: number;
    minOperatingProfitMarginPercent: number;
    minNetProfitMarginPercent: number;
    maxReceivablesOver180DaysPercent: number;
    maxCcOdUtilizationPercent: number;
    minBankContinuityPercent: number;
  };
  sheets: {
    gst: string[];
    banking: string[];
    financial: string[];
    flags: string[];
  };
  anomaliesEnabled: {
    sameDayPassThrough: boolean;
    lowBalanceChurn: boolean;
    nilExemptShare: boolean;
    stickyReceivables: boolean;
    unsecuredLoansFromVendors: boolean;
    cibilEnquirySpike: boolean;
  };
}

export const DEFAULT_CDD_TEMPLATE: CddTemplateConfig = {
  templateName: 'Loanbazaar Standard SME & Corporate Due Diligence Template',
  version: '2026.3.1',
  lastUpdated: '2026-08-21',
  reportingCurrency: 'INR',
  defaultScale: 'Crores',
  benchmarks: {
    minDscr: 1.25,
    maxTolTnw: 3.50,
    maxDebtToEquity: 2.50,
    minCurrentRatio: 1.33,
    minQuickRatio: 0.80,
    minOperatingProfitMarginPercent: 3.00,
    minNetProfitMarginPercent: 1.00,
    maxReceivablesOver180DaysPercent: 10.00,
    maxCcOdUtilizationPercent: 90.00,
    minBankContinuityPercent: 98.00,
  },
  sheets: {
    gst: ['Summary_FY', 'Monthly_by_GSTIN', 'Buyers', 'Suppliers', 'HSN', 'Filing_Compliance', 'Source_Map'],
    banking: ['Summary_FY', 'Monthly_by_Account', 'Party_Inflow', 'Party_Outflow', 'Returns_and_Cash', 'Loans_and_EMI', 'Transactions', 'Source_Map'],
    financial: ['PL_Standardised', 'BS_Standardised', 'Ratios_3yr', 'Debt_Schedule', 'Covenants', 'Ageing', 'Credit_Reports', 'SWOT', 'Source_Map'],
    flags: ['Flags_Summary', 'Reconciliations_Audit', 'Data_Quality_Log', 'Source_Map'],
  },
  anomaliesEnabled: {
    sameDayPassThrough: true,
    lowBalanceChurn: true,
    nilExemptShare: true,
    stickyReceivables: true,
    unsecuredLoansFromVendors: true,
    cibilEnquirySpike: true,
  },
};
