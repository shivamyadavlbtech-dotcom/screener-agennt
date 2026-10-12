import { CddDataset, ProcessedFile, GstReturnRow, GstBuyerSupplier, BankAccountSummary, BankMonthlyAggregate, BankTxn, FsLine } from '../types/cdd';
import { computeAll25Ratios } from '../engine/financialRatios';
import { runAllReconciliations } from '../engine/reconciliations';

/**
 * Golden Test Case: Venkata Ramana Oils Private Limited (VROPL)
 * Benchmark case with 125 files in 11 folders matching all criteria in Part F.
 */

export function getVroplSampleDataset(): CddDataset {
  const company = {
    name: 'Venkata Ramana Oils Private Limited',
    cin: 'U15142AP2018PTC109841',
    pan: 'AAECV2819N',
    gstinList: [
      '37AAECV2819N1ZZ', // Andhra Pradesh (Refinery & Plant)
      '36AAECV2819N1ZZ', // Telangana (Hyderabad Depot)
      '29AAECV2819N1ZZ', // Karnataka (Bangalore Depot)
    ],
    fyYears: ['FY23-24', 'FY24-25', 'FY25-26'],
    directorNames: ['Venkata Ramana Rao', 'Sujatha Rao', 'Kishore Kumar Rao'],
    registeredAddress: 'Plot No. 42-45, Industrial Park, Peddapuram, Kakinada, Andhra Pradesh - 533437',
    industry: 'Edible Oils Processing & Refining (Palm, Sunflower & Cottonseed Oil)',
    sanctionedFacilities: [
      {
        bank: 'YES Bank Limited',
        type: 'Working Capital Cash Credit (CC)',
        sanctionedAmount: 80000000, // Rs 8.00 Cr
        covenants: ['Min DSCR 1.25x', 'Max TOL/TNW 3.50x', 'Monthly stock & book debt statements'],
      },
      {
        bank: 'HDFC Bank Limited',
        type: 'Working Capital Cash Credit (CC)',
        sanctionedAmount: 50000000, // Rs 5.00 Cr
        covenants: ['First pari-passu charge on current assets', 'Minimum 60% banking throughput'],
      },
    ],
  };

  // 1. Files Inventory (125 files, 11 folders)
  const folders = [
    '01_GST_Returns_AP_37AA',
    '02_GST_Returns_TS_36AA',
    '03_GST_Returns_KA_29AA',
    '04_YES_Bank_Statements',
    '05_HDFC_Bank_Statements_pass-2819',
    '06_Audited_Financials_FY24_FY25',
    '07_Provisional_Financials_FY26',
    '08_Tally_Ledger_Exports_177_Files',
    '09_EInvoices_Apr_Jun_2026',
    '10_Debtor_Creditor_Ageing_Schedules',
    '11_Sanction_CIBIL_Legal_KYC',
  ];

  const files: ProcessedFile[] = [];

  // Folder 1: AP GST Returns (12 files)
  for (let m = 1; m <= 12; m++) {
    const month = m < 10 ? `0${m}` : `${m}`;
    files.push({
      id: `file-gst-ap-${m}`,
      name: `GSTR-3B_37AAECV2819N1ZZ_2024${month}.pdf`,
      folderPath: folders[0],
      size: 142000 + m * 3100,
      mimeType: 'application/pdf',
      magicBytesType: 'application/pdf',
      pageCount: 3,
      isEncrypted: false,
      hasTextLayer: true,
      domain: 'GST',
      docType: 'gstr3b',
      confidence: 0.99,
      status: 'completed',
    });
  }

  // Folder 2: TS GST Returns (10 files)
  for (let m = 1; m <= 10; m++) {
    const month = m < 10 ? `0${m}` : `${m}`;
    files.push({
      id: `file-gst-ts-${m}`,
      name: `GSTR-3B_36AAECV2819N1ZZ_2024${month}.pdf`,
      folderPath: folders[1],
      size: 138000 + m * 2400,
      mimeType: 'application/pdf',
      magicBytesType: 'application/pdf',
      pageCount: 3,
      isEncrypted: false,
      hasTextLayer: true,
      domain: 'GST',
      docType: 'gstr3b',
      confidence: 0.99,
      status: 'completed',
    });
  }

  // Folder 3: KA GST Returns (9 files)
  for (let m = 1; m <= 9; m++) {
    const month = m < 10 ? `0${m}` : `${m}`;
    files.push({
      id: `file-gst-ka-${m}`,
      name: `GSTR-3B_29AAECV2819N1ZZ_2024${month}.pdf`,
      folderPath: folders[2],
      size: 135000 + m * 2100,
      mimeType: 'application/pdf',
      magicBytesType: 'application/pdf',
      pageCount: 3,
      isEncrypted: false,
      hasTextLayer: true,
      domain: 'GST',
      docType: 'gstr3b',
      confidence: 0.99,
      status: 'completed',
    });
  }

  // Folder 4: YES Bank Statements (12 files)
  for (let m = 1; m <= 12; m++) {
    files.push({
      id: `file-bank-yes-${m}`,
      name: `YES_Bank_002382100000412_M${m}_FY25.pdf`,
      folderPath: folders[3],
      size: 890000 + m * 15000,
      mimeType: 'application/pdf',
      magicBytesType: 'application/pdf',
      pageCount: 14,
      isEncrypted: false,
      hasTextLayer: true,
      domain: 'Banking',
      docType: 'bank_statement',
      confidence: 0.98,
      status: 'completed',
    });
  }

  // Folder 5: HDFC Bank Statements (3 encrypted files unlocked with password "2819")
  for (let m = 1; m <= 3; m++) {
    files.push({
      id: `file-bank-hdfc-${m}`,
      name: `HDFC_CC_502000421890_Q${m}_pass-2819.pdf`,
      folderPath: folders[4],
      size: 1240000 + m * 22000,
      mimeType: 'application/pdf',
      magicBytesType: 'application/pdf',
      pageCount: 18,
      isEncrypted: true,
      unlockedPassword: '2819',
      hasTextLayer: false, // Scanned layout with old column inversion
      domain: 'Banking',
      docType: 'bank_statement',
      confidence: 0.96,
      status: 'completed',
    });
  }

  // Folder 6 & 7: Audited & Provisional Financials (6 files)
  files.push({
    id: 'file-fs-24',
    name: 'Audited_Financial_Statements_VROPL_FY23-24.pdf',
    folderPath: folders[5],
    size: 2450000,
    mimeType: 'application/pdf',
    magicBytesType: 'application/pdf',
    pageCount: 38,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'Financial',
    docType: 'audited_fs',
    confidence: 0.99,
    status: 'completed',
  });
  files.push({
    id: 'file-fs-25',
    name: 'Audited_Financial_Statements_VROPL_FY24-25.pdf',
    folderPath: folders[5],
    size: 2680000,
    mimeType: 'application/pdf',
    magicBytesType: 'application/pdf',
    pageCount: 42,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'Financial',
    docType: 'audited_fs',
    confidence: 0.99,
    status: 'completed',
  });
  files.push({
    id: 'file-fs-3cd',
    name: 'Tax_Audit_Report_Form_3CD_FY24-25.pdf',
    folderPath: folders[5],
    size: 1980000,
    mimeType: 'application/pdf',
    magicBytesType: 'application/pdf',
    pageCount: 26,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'Financial',
    docType: 'tax_audit_3cd',
    confidence: 0.99,
    status: 'completed',
  });
  files.push({
    id: 'file-fs-26-prov',
    name: 'Provisional_P&L_and_BS_VROPL_FY25-26.xlsx',
    folderPath: folders[6],
    size: 450000,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magicBytesType: 'application/zip',
    pageCount: 4,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'Financial',
    docType: 'provisional_fs',
    confidence: 0.98,
    status: 'completed',
  });

  // Folder 8: Ledgers (50 representative files out of 177 in VROPL pack)
  for (let l = 1; l <= 50; l++) {
    files.push({
      id: `file-ledger-${l}`,
      name: `Tally_Ledger_Export_Acc_${1000 + l}.xlsx`,
      folderPath: folders[7],
      size: 98000 + l * 1200,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      magicBytesType: 'application/zip',
      pageCount: 6,
      isEncrypted: false,
      hasTextLayer: true,
      domain: 'Financial',
      docType: 'ledger_export',
      confidence: 0.97,
      status: 'completed',
    });
  }

  // Folder 9: Invoices Apr-Jun 2026 (12 representative files)
  files.push({
    id: 'file-inv-ap',
    name: 'EInvoices_AP_Branch_52_Invoices.csv',
    folderPath: folders[8],
    size: 340000,
    mimeType: 'text/csv',
    magicBytesType: 'text/plain',
    pageCount: 52,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'GST',
    docType: 'sales_invoice_einvoice',
    confidence: 0.99,
    status: 'completed',
  });
  files.push({
    id: 'file-inv-hyd',
    name: 'EInvoices_Hyderabad_Branch_99_Invoices.csv',
    folderPath: folders[8],
    size: 580000,
    mimeType: 'text/csv',
    magicBytesType: 'text/plain',
    pageCount: 99,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'GST',
    docType: 'sales_invoice_einvoice',
    confidence: 0.99,
    status: 'completed',
  });
  files.push({
    id: 'file-inv-ka',
    name: 'EInvoices_Karnataka_Branch_158_Invoices.csv',
    folderPath: folders[8],
    size: 890000,
    mimeType: 'text/csv',
    magicBytesType: 'text/plain',
    pageCount: 158,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'GST',
    docType: 'sales_invoice_einvoice',
    confidence: 0.99,
    status: 'completed',
  });

  // Folder 10: Ageing schedules (4 files)
  files.push({
    id: 'file-ageing-debtors',
    name: 'Trade_Debtor_Ageing_Breakup_31_March_2025.xlsx',
    folderPath: folders[9],
    size: 420000,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magicBytesType: 'application/zip',
    pageCount: 5,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'Financial',
    docType: 'debtor_ageing',
    confidence: 0.99,
    status: 'completed',
  });
  files.push({
    id: 'file-ageing-creditors',
    name: 'Trade_Creditor_Ageing_Breakup_31_March_2025.xlsx',
    folderPath: folders[9],
    size: 380000,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magicBytesType: 'application/zip',
    pageCount: 4,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'Financial',
    docType: 'creditor_ageing',
    confidence: 0.99,
    status: 'completed',
  });

  // Folder 11: Sanction, CIBIL, Legal & KYC (5 files)
  files.push({
    id: 'file-sanction-13cr',
    name: 'Sanction_Letter_Rs_13Cr_Consortium.pdf',
    folderPath: folders[10],
    size: 1850000,
    mimeType: 'application/pdf',
    magicBytesType: 'application/pdf',
    pageCount: 12,
    isEncrypted: false,
    hasTextLayer: false, // Scanned copy
    domain: 'Financial',
    docType: 'sanction_letter',
    confidence: 0.98,
    status: 'completed',
  });
  files.push({
    id: 'file-cibil-comm',
    name: 'CIBIL_Commercial_Credit_Report_VROPL.pdf',
    folderPath: folders[10],
    size: 1450000,
    mimeType: 'application/pdf',
    magicBytesType: 'application/pdf',
    pageCount: 16,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'Financial',
    docType: 'cibil_company',
    confidence: 0.99,
    status: 'completed',
  });
  files.push({
    id: 'file-mca-master',
    name: 'MCA_Company_Master_Data_VROPL.pdf',
    folderPath: folders[10],
    size: 210000,
    mimeType: 'application/pdf',
    magicBytesType: 'application/pdf',
    pageCount: 2,
    isEncrypted: false,
    hasTextLayer: true,
    domain: 'KYC/other',
    docType: 'mca_master',
    confidence: 1.0,
    status: 'completed',
  });

  // Pad remaining to 125 total files for exact VROPL benchmark inventory
  const currentCount = files.length;
  for (let i = currentCount + 1; i <= 125; i++) {
    files.push({
      id: `file-aux-${i}`,
      name: `VROPL_Supporting_Ledger_Doc_${i}.pdf`,
      folderPath: folders[7],
      size: 110000 + (i % 20) * 8000,
      mimeType: 'application/pdf',
      magicBytesType: 'application/pdf',
      pageCount: 4,
      isEncrypted: false,
      hasTextLayer: true,
      domain: 'Financial',
      docType: 'ledger_export',
      confidence: 0.96,
      status: 'completed',
    });
  }

  // 2. GST Returns (31 GSTR-3Bs across 3 GSTINs)
  const gstReturns: GstReturnRow[] = [];
  const gstinMeta = [
    { gstin: '37AAECV2819N1ZZ', state: 'Andhra Pradesh', weight: 0.65 },
    { gstin: '36AAECV2819N1ZZ', state: 'Telangana', weight: 0.22 },
    { gstin: '29AAECV2819N1ZZ', state: 'Karnataka', weight: 0.13 },
  ];

  // FY24-25 returns: Total outward = Rs 104.06 Cr
  const totalFy24Revenue = 1040600000;
  for (let m = 1; m <= 12; m++) {
    const monthName = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'][m - 1];
    const period = `${monthName} 2024`;
    gstinMeta.forEach((g) => {
      const taxable = Math.round((totalFy24Revenue * g.weight * 0.72) / 12);
      const nilExempt = Math.round((totalFy24Revenue * g.weight * 0.28) / 12);
      const igst = Math.round(taxable * 0.03);
      const cgst = Math.round(taxable * 0.01);
      const sgst = cgst;
      const totalOutward = taxable + nilExempt;
      const itc = Math.round(taxable * 0.048);

      gstReturns.push({
        gstin: g.gstin,
        state: g.state,
        financialYear: 'FY24-25',
        period,
        arn: `AA370${m}2400${Math.floor(10000 + Math.random() * 90000)}`,
        arnDate: `2024-${m < 9 ? '0' + (m + 4) : m - 8}-20`,
        taxable_3_1a: taxable,
        igst_3_1a: igst,
        cgst_3_1a: cgst,
        sgst_3_1a: sgst,
        cess_3_1a: 0,
        zeroRated_3_1b: 0,
        nilExempt_3_1c: nilExempt,
        totalOutward,
        itcNet_igst: Math.round(itc * 0.6),
        itcNet_cgst: Math.round(itc * 0.2),
        itcNet_sgst: Math.round(itc * 0.2),
        totalItcNet: itc,
        exemptInward_table5: Math.round(nilExempt * 0.85),
        lateFee: m === 7 ? 2500 : 0,
        interestPaid: m === 7 ? 4200 : 0,
        filingDate: `2024-${m < 9 ? '0' + (m + 4) : m - 8}-20`,
        isLate: m === 7,
        source: {
          file: `GSTR-3B_${g.gstin}_${period}.pdf`,
          folder: `01_GST_Returns_${g.state.slice(0, 2).toUpperCase()}`,
          page: 1,
          method: 'text',
          confidence: 0.99,
        },
      });
    });
  }

  // FY25-26 Outward supplies: ~Rs 173.00 Cr
  const totalFy25Revenue = 1730000000;
  for (let m = 1; m <= 12; m++) {
    const monthName = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar'][m - 1];
    const period = `${monthName} 2025`;
    gstinMeta.forEach((g) => {
      const taxable = Math.round((totalFy25Revenue * g.weight * 0.72) / 12);
      const nilExempt = Math.round((totalFy25Revenue * g.weight * 0.28) / 12);
      const igst = Math.round(taxable * 0.032);
      const cgst = Math.round(taxable * 0.009);
      const sgst = cgst;
      const totalOutward = taxable + nilExempt;
      const itc = Math.round(taxable * 0.048);

      gstReturns.push({
        gstin: g.gstin,
        state: g.state,
        financialYear: 'FY25-26',
        period,
        arn: `AA370${m}2500${Math.floor(10000 + Math.random() * 90000)}`,
        arnDate: `2025-${m < 9 ? '0' + (m + 4) : m - 8}-19`,
        taxable_3_1a: taxable,
        igst_3_1a: igst,
        cgst_3_1a: cgst,
        sgst_3_1a: sgst,
        cess_3_1a: 0,
        zeroRated_3_1b: 0,
        nilExempt_3_1c: nilExempt,
        totalOutward,
        itcNet_igst: Math.round(itc * 0.6),
        itcNet_cgst: Math.round(itc * 0.2),
        itcNet_sgst: Math.round(itc * 0.2),
        totalItcNet: itc,
        exemptInward_table5: Math.round(nilExempt * 0.85),
        lateFee: 0,
        interestPaid: 0,
        filingDate: `2025-${m < 9 ? '0' + (m + 4) : m - 8}-19`,
        isLate: false,
        source: {
          file: `GSTR-3B_${g.gstin}_${period}.pdf`,
          folder: `01_GST_Returns_${g.state.slice(0, 2).toUpperCase()}`,
          page: 1,
          method: 'text',
          confidence: 0.99,
        },
      });
    });
  }

  // 3. GST Buyers & Suppliers
  const gstBuyers: GstBuyerSupplier[] = [
    { name: 'GODREJ AGROVET LIMITED', gstin: '27AAACG0426P1ZP', state: 'Maharashtra', amount: 385000000, sharePercent: 22.25, transactionCount: 184, isRelatedParty: false, source: { file: 'EInvoices_AP_Branch_52_Invoices.csv', method: 'excel' } },
    { name: 'GEMINI EDIBLES & FATS INDIA LTD', gstin: '36AABCG7891E1Z4', state: 'Telangana', amount: 312000000, sharePercent: 18.03, transactionCount: 142, isRelatedParty: false, source: { file: 'EInvoices_AP_Branch_52_Invoices.csv', method: 'excel' } },
    { name: 'ADANI WILMAR LIMITED', gstin: '24AAACA3421C1ZU', state: 'Gujarat', amount: 268000000, sharePercent: 15.49, transactionCount: 118, isRelatedParty: false, source: { file: 'EInvoices_Hyderabad_Branch_99_Invoices.csv', method: 'excel' } },
    { name: 'PATANJALI FOODS LIMITED', gstin: '23AAACR2984K1Z9', state: 'Madhya Pradesh', amount: 194000000, sharePercent: 11.21, transactionCount: 88, isRelatedParty: false, source: { file: 'EInvoices_Karnataka_Branch_158_Invoices.csv', method: 'excel' } },
    { name: 'KALEESUWARI REFINERY PVT LTD', gstin: '33AAACK1294F1ZZ', state: 'Tamil Nadu', amount: 154000000, sharePercent: 8.90, transactionCount: 76, isRelatedParty: false, source: { file: 'EInvoices_AP_Branch_52_Invoices.csv', method: 'excel' } },
    { name: 'SRI BALAJI AGRO TRADERS (ASSOCIATE)', gstin: '37AAYPB9201L1Z2', state: 'Andhra Pradesh', amount: 98000000, sharePercent: 5.66, transactionCount: 44, isRelatedParty: true, source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', method: 'vision' } },
  ];

  const gstSuppliers: GstBuyerSupplier[] = [
    { name: 'WILMAR TRADING PTE / IMPORT CONSORTIUM', gstin: 'FOREIGN_IMP', state: 'Import (Kakinada Port)', amount: 620000000, sharePercent: 39.74, transactionCount: 28, isRelatedParty: false, source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', method: 'vision' } },
    { name: 'ANDHRA PRADESH OILFED', gstin: '37AAACA0894P1Z3', state: 'Andhra Pradesh', amount: 345000000, sharePercent: 22.12, transactionCount: 94, isRelatedParty: false, source: { file: 'Tally_Ledger_Export_Acc_1001.xlsx', method: 'excel' } },
    { name: 'TELANGANA STATE OILFED', gstin: '36AAACT4812K1Z8', state: 'Telangana', amount: 248000000, sharePercent: 15.90, transactionCount: 68, isRelatedParty: false, source: { file: 'Tally_Ledger_Export_Acc_1002.xlsx', method: 'excel' } },
    { name: 'RUCHI SOYA COMMODITIES VENDORS', gstin: '23AABCR1290P1Z1', state: 'Madhya Pradesh', amount: 182000000, sharePercent: 11.67, transactionCount: 52, isRelatedParty: false, source: { file: 'Tally_Ledger_Export_Acc_1003.xlsx', method: 'excel' } },
  ];

  // 4. Bank Accounts (YES Bank credits/debits ~Rs 100.3 Cr each; HDFC Bank with 100% delta continuity)
  const bankAccounts: BankAccountSummary[] = [
    {
      bank: 'YES Bank Limited',
      accountNumber: '002382100000412',
      accountType: 'Current',
      sanctionedLimit: 80000000,
      periodStart: '2024-04-01',
      periodEnd: '2025-03-31',
      totalCredits: 1003215480, // ~Rs 100.32 Cr
      totalDebits: 1002845210, // ~Rs 100.28 Cr
      totalTurnoverClean: 981240000, // Excludes Rs 2.19 Cr internal transfers
      internalTransfersAmount: 21975480,
      totalTxnCount: 1840,
      balanceContinuityPercent: 99.9,
      cashDepositsAmount: 850000, // Very low cash deposit (edible oil B2B)
      bouncesCount: 0, // Zero bounces
      avgMonthlyBalance: 1485000, // Rs 14.85 Lakhs (Low balance churning)
      closingBalanceAsOfMarch31: 4218000, // Rs 42.18 Lakhs
      source: {
        file: 'YES_Bank_002382100000412_M12_FY25.pdf',
        folder: '04_YES_Bank_Statements',
        page: 14,
        method: 'text',
      },
    },
    {
      bank: 'HDFC Bank Limited',
      accountNumber: '502000421890',
      accountType: 'CC/OD',
      sanctionedLimit: 50000000, // Rs 5.00 Cr
      periodStart: '2024-04-01',
      periodEnd: '2025-03-31',
      totalCredits: 421500000, // Rs 42.15 Cr
      totalDebits: 418900000,
      totalTurnoverClean: 399524520,
      internalTransfersAmount: 21975480,
      totalTxnCount: 890,
      balanceContinuityPercent: 99.8, // 100% after balance-delta logic (was ~32% if columns trusted)
      cashDepositsAmount: 120000,
      bouncesCount: 0,
      avgMonthlyBalance: 1850000,
      closingBalanceAsOfMarch31: 2600000,
      source: {
        file: 'HDFC_CC_502000421890_Q4_pass-2819.pdf',
        folder: '05_HDFC_Bank_Statements_pass-2819',
        page: 18,
        method: 'vision',
      },
    },
  ];

  // Bank Monthly Aggregates (12 months for YES Bank)
  const bankMonthly: BankMonthlyAggregate[] = [];
  const monthlyInflows = [
    78200000, 81400000, 84500000, 79900000, 83200000, 86100000,
    85400000, 82900000, 87800000, 84200000, 81900000, 87625480,
  ];
  let runningBal = 3848000;
  for (let m = 1; m <= 12; m++) {
    const month = m < 10 ? `2024-0${m}` : `2024-${m}`;
    const inflow = monthlyInflows[m - 1];
    const outflow = inflow - Math.round((Math.random() * 400000 - 150000));
    const opening = runningBal;
    runningBal = runningBal + inflow - outflow;
    bankMonthly.push({
      month,
      accountNumber: '002382100000412',
      bank: 'YES Bank Limited',
      openingBalance: opening,
      closingBalance: runningBal,
      inflowTotal: inflow,
      outflowTotal: outflow,
      cleanTurnover: Math.round(inflow * 0.98),
      minBalance: Math.round(runningBal * 0.35),
      avgBalance: Math.round(runningBal * 0.78),
      bouncesCount: 0,
    });
  }

  // Representative Bank Transactions with Balance Delta Verification
  const bankTransactions: BankTxn[] = [
    {
      id: 'txn-yes-01',
      bank: 'YES Bank Limited',
      accountNumber: '002382100000412',
      date: '2024-04-02',
      narration: 'RTGS CR GODREJ AGROVET LTD YESB0000001 REF 92837461',
      withdrawalRaw: '',
      depositRaw: '2,45,00,000.00',
      balanceRaw: '2,83,48,000.00',
      computedDirection: 'CR',
      computedAmount: 24500000,
      verifiedBalance: 28348000,
      deltaMismatch: false,
      counterparty: 'GODREJ AGROVET LTD',
      category: 'Sales / Inflow',
      source: { file: 'YES_Bank_002382100000412_M1_FY25.pdf', page: 1, method: 'text' },
    },
    {
      id: 'txn-yes-02',
      bank: 'YES Bank Limited',
      accountNumber: '002382100000412',
      date: '2024-04-02',
      narration: 'NEFT DR WILMAR TRADING IMPORT LC SETTLEMENT IBKL00002',
      withdrawalRaw: '2,40,00,000.00',
      depositRaw: '',
      balanceRaw: '43,48,000.00',
      computedDirection: 'DR',
      computedAmount: 24000000,
      verifiedBalance: 4348000,
      deltaMismatch: false,
      counterparty: 'WILMAR TRADING IMPORT LC',
      category: 'Supplier / Outflow',
      source: { file: 'YES_Bank_002382100000412_M1_FY25.pdf', page: 1, method: 'text' },
    },
    {
      id: 'txn-yes-03',
      bank: 'YES Bank Limited',
      accountNumber: '002382100000412',
      date: '2024-04-05',
      narration: 'TRANSFER TO HDFC BANK CC ACC 502000421890 INTERNAL TPT',
      withdrawalRaw: '35,00,000.00',
      depositRaw: '',
      balanceRaw: '8,48,000.00',
      computedDirection: 'DR',
      computedAmount: 3500000,
      verifiedBalance: 848000,
      deltaMismatch: false,
      isInternalTransfer: true,
      counterparty: 'HDFC BANK CC ACC 502000421890',
      category: 'Internal Transfer',
      source: { file: 'YES_Bank_002382100000412_M1_FY25.pdf', page: 2, method: 'text' },
    },
    {
      id: 'txn-hdfc-01',
      bank: 'HDFC Bank Limited',
      accountNumber: '502000421890',
      date: '2024-04-06',
      narration: 'FUNDS TFR FR YES BANK LTD 002382100000412 CHQ 00192',
      withdrawalRaw: '35,00,000.00', // Note: Misplaced into withdrawal column in old HDFC scan!
      depositRaw: '',
      balanceRaw: '43,48,000.00',
      computedDirection: 'CR', // Delta logic automatically recognized balance increased by 35 Lakhs!
      computedAmount: 3500000,
      verifiedBalance: 4348000,
      deltaMismatch: false,
      isInternalTransfer: true,
      counterparty: 'YES BANK LTD 002382100000412',
      category: 'Internal Transfer',
      source: { file: 'HDFC_CC_502000421890_Q1_pass-2819.pdf', page: 2, method: 'vision' },
    },
    {
      id: 'txn-yes-04',
      bank: 'YES Bank Limited',
      accountNumber: '002382100000412',
      date: '2024-05-12',
      narration: 'RTGS CR ADANI WILMAR LTD HDFC0000123 INV 40192',
      withdrawalRaw: '',
      depositRaw: '1,85,00,000.00',
      balanceRaw: '1,93,48,000.00',
      computedDirection: 'CR',
      computedAmount: 18500000,
      verifiedBalance: 19348000,
      deltaMismatch: false,
      counterparty: 'ADANI WILMAR LTD',
      category: 'Sales / Inflow',
      source: { file: 'YES_Bank_002382100000412_M2_FY25.pdf', page: 3, method: 'text' },
    },
  ];

  // 5. Standardized P&L Lines (Part F exact benchmarks: FY24: 104.06 Cr / 1.56 Cr; FY23: 22.77 Cr / 9.74 L; FY26: 173 Cr)
  const plLines: FsLine[] = [
    {
      statement: 'PL',
      standardKey: 'REVENUE_FROM_OPERATIONS',
      label: 'Revenue from Operations (Gross Turnover)',
      values: { 'FY23-24': 227745000, 'FY24-25': 1040612000, 'FY25-26': 1730000000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 18, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'PL',
      standardKey: 'OTHER_INCOME',
      label: 'Other Income',
      values: { 'FY23-24': 850000, 'FY24-25': 2450000, 'FY25-26': 4200000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 18, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'PL',
      standardKey: 'COGS',
      label: 'Cost of Raw Materials & Crude Oil Consumed',
      values: { 'FY23-24': 214500000, 'FY24-25': 978500000, 'FY25-26': 1626200000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 19, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'PL',
      standardKey: 'OPERATING_EXPENSES',
      label: 'Manufacturing, Power, Fuel & Other Operating Expenses',
      values: { 'FY23-24': 8450000, 'FY24-25': 28900000, 'FY25-26': 46800000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 19, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'PL',
      standardKey: 'EBITDA',
      label: 'Operating Profit (EBITDA)',
      isSubtotal: true,
      values: { 'FY23-24': 5645000, 'FY24-25': 35662000, 'FY25-26': 61200000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 18, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'PL',
      standardKey: 'DEPRECIATION',
      label: 'Depreciation and Amortisation Expense',
      values: { 'FY23-24': 2100000, 'FY24-25': 4850000, 'FY25-26': 6800000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 20, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'PL',
      standardKey: 'FINANCE_COSTS',
      label: 'Finance Costs (Interest on CC/OD & Term Loans)',
      values: { 'FY23-24': 2245000, 'FY24-25': 9650000, 'FY25-26': 16500000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 20, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'PL',
      standardKey: 'PBT',
      label: 'Profit Before Tax (PBT)',
      isSubtotal: true,
      values: { 'FY23-24': 1300000, 'FY24-25': 21162000, 'FY25-26': 37900000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 18, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'PL',
      standardKey: 'PAT',
      label: 'Profit After Tax (PAT / Net Profit)',
      isSubtotal: true,
      values: { 'FY23-24': 974000, 'FY24-25': 15612000, 'FY25-26': 27800000 }, // FY24: 1.56 Cr; FY23: 9.74 L
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 18, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
  ];

  // 6. Standardized Balance Sheet Lines
  const bsLines: FsLine[] = [
    {
      statement: 'BS',
      standardKey: 'SHARE_CAPITAL',
      label: 'Equity Share Capital',
      values: { 'FY23-24': 30000000, 'FY24-25': 30000000, 'FY25-26': 30000000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 16, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'RESERVES_SURPLUS',
      label: 'Reserves and Surplus',
      values: { 'FY23-24': 1420000, 'FY24-25': 17032000, 'FY25-26': 44832000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 16, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'TANGIBLE_NET_WORTH',
      label: 'Tangible Net Worth (TNW)',
      isSubtotal: true,
      values: { 'FY23-24': 31420000, 'FY24-25': 47032000, 'FY25-26': 74832000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 16, method: 'computed', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'LONG_TERM_BORROWINGS',
      label: 'Long Term Borrowings (Term Loans & Subordinated Promoter Loans)',
      values: { 'FY23-24': 12500000, 'FY24-25': 24000000, 'FY25-26': 31000000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 16, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'SHORT_TERM_BORROWINGS',
      label: 'Short Term Borrowings (Bank Working Capital CC/OD)',
      values: { 'FY23-24': 24800000, 'FY24-25': 68500000, 'FY25-26': 107700000 }, // Sanction Rs 13 Cr
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 16, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'TRADE_PAYABLES',
      label: 'Trade Payables (Creditors for Crude Oil)',
      values: { 'FY23-24': 18400000, 'FY24-25': 51800000, 'FY25-26': 78400000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 16, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'TOTAL_OUTSIDE_LIABILITIES',
      label: 'Total Outside Liabilities (TOL)',
      isSubtotal: true,
      values: { 'FY23-24': 59800000, 'FY24-25': 148900000, 'FY25-26': 222800000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 16, method: 'computed', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'NET_FIXED_ASSETS',
      label: 'Property, Plant and Equipment (Refinery)',
      values: { 'FY23-24': 28500000, 'FY24-25': 42000000, 'FY25-26': 58000000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 17, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'INVENTORIES',
      label: 'Inventories (Raw Oil, Work in Progress & Finished Goods)',
      values: { 'FY23-24': 14200000, 'FY24-25': 48900000, 'FY25-26': 81200000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 17, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'TRADE_RECEIVABLES',
      label: 'Trade Receivables (Book Debts)',
      values: { 'FY23-24': 24800000, 'FY24-25': 89000000, 'FY25-26': 148000000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 17, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'CASH_AND_BANK',
      label: 'Cash and Bank Balances',
      values: { 'FY23-24': 3848000, 'FY24-25': 6818000, 'FY25-26': 10432000 }, // FY25: Rs 68.18 L (YES 42.18L + HDFC 26L)
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 17, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
    {
      statement: 'BS',
      standardKey: 'TOTAL_ASSETS',
      label: 'Total Assets',
      isSubtotal: true,
      values: { 'FY23-24': 91220000, 'FY24-25': 195932000, 'FY25-26': 297632000 },
      source: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 17, method: 'vision', confidence: 0.99 },
      confidence: 0.99,
    },
  ];

  // 7. Compute All 25 CDD Ratios
  const metricValues = {
    revenue: { 'FY23-24': 227745000, 'FY24-25': 1040612000, 'FY25-26': 1730000000 },
    cogs: { 'FY23-24': 214500000, 'FY24-25': 978500000, 'FY25-26': 1626200000 },
    operatingExpenses: { 'FY23-24': 8450000, 'FY24-25': 28900000, 'FY25-26': 46800000 },
    ebitda: { 'FY23-24': 5645000, 'FY24-25': 35662000, 'FY25-26': 61200000 },
    depreciation: { 'FY23-24': 2100000, 'FY24-25': 4850000, 'FY25-26': 6800000 },
    ebit: { 'FY23-24': 3545000, 'FY24-25': 30812000, 'FY25-26': 54400000 },
    interestExpense: { 'FY23-24': 2245000, 'FY24-25': 9650000, 'FY25-26': 16500000 },
    tax: { 'FY23-24': 326000, 'FY24-25': 5550000, 'FY25-26': 10100000 },
    pat: { 'FY23-24': 974000, 'FY24-25': 15612000, 'FY25-26': 27800000 },
    operatingCashFlow: { 'FY23-24': 2850000, 'FY24-25': 19500000, 'FY25-26': 34200000 },
    shareCapital: { 'FY23-24': 30000000, 'FY24-25': 30000000, 'FY25-26': 30000000 },
    reservesAndSurplus: { 'FY23-24': 1420000, 'FY24-25': 17032000, 'FY25-26': 44832000 },
    tangibleNetWorth: { 'FY23-24': 31420000, 'FY24-25': 47032000, 'FY25-26': 74832000 },
    promoterSubordinatedDebt: { 'FY23-24': 8000000, 'FY24-25': 24000000, 'FY25-26': 24000000 },
    longTermBorrowings: { 'FY23-24': 12500000, 'FY24-25': 24000000, 'FY25-26': 31000000 },
    shortTermBorrowings: { 'FY23-24': 24800000, 'FY24-25': 68500000, 'FY25-26': 107700000 },
    totalDebt: { 'FY23-24': 37300000, 'FY24-25': 92500000, 'FY25-26': 138700000 },
    tradePayables: { 'FY23-24': 18400000, 'FY24-25': 51800000, 'FY25-26': 78400000 },
    otherCurrentLiabilities: { 'FY23-24': 4100000, 'FY24-25': 4600000, 'FY25-26': 5700000 },
    totalOutsideLiabilities: { 'FY23-24': 59800000, 'FY24-25': 148900000, 'FY25-26': 222800000 },
    currentAssets: { 'FY23-24': 42848000, 'FY24-25': 144718000, 'FY25-26': 239632000 },
    inventories: { 'FY23-24': 14200000, 'FY24-25': 48900000, 'FY25-26': 81200000 },
    tradeReceivables: { 'FY23-24': 24800000, 'FY24-25': 89000000, 'FY25-26': 148000000 },
    cashAndBank: { 'FY23-24': 3848000, 'FY24-25': 6818000, 'FY25-26': 10432000 },
    currentLiabilities: { 'FY23-24': 47300000, 'FY24-25': 124900000, 'FY25-26': 191800000 },
    debtorsOver180Days: { 'FY23-24': 1100000, 'FY24-25': 5200000, 'FY25-26': 7800000 },
    sanctionedLimit: { 'FY23-24': 50000000, 'FY24-25': 130000000, 'FY25-26': 130000000 },
    drawingPower: { 'FY23-24': 42000000, 'FY24-25': 118000000, 'FY25-26': 124000000 },
    ccOdUtilization: { 'FY23-24': 68.5, 'FY24-25': 78.4, 'FY25-26': 84.2 },
    gstTurnover: { 'FY23-24': 227745000, 'FY24-25': 1040612000, 'FY25-26': 1730000000 },
    bankingTurnover: { 'FY23-24': 219800000, 'FY24-25': 981240000, 'FY25-26': 1684000000 },
  };

  const ratios = computeAll25Ratios(company.fyYears, metricValues);

  // 8. Reconciliations & Flags (Part B7 and B8)
  const sourceRefs: Record<string, any> = {
    bank_statement: { file: 'YES_Bank_002382100000412_M12_FY25.pdf', page: 1, method: 'text' },
    audited_fs: { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 16, method: 'vision' },
    gstr3b: { file: 'GSTR-3B_37AAECV2819N1ZZ_202503.pdf', page: 1, method: 'text' },
    sales_invoice_einvoice: { file: 'EInvoices_AP_Branch_52_Invoices.csv', method: 'excel' },
    ledger_export: { file: 'Tally_Ledger_Export_Acc_1001.xlsx', method: 'excel' },
    debtor_ageing: { file: 'Trade_Debtor_Ageing_Breakup_31_March_2025.xlsx', method: 'excel' },
    loan_obligation_sheet: { file: 'Sanction_Letter_Rs_13Cr_Consortium.pdf', page: 4, method: 'vision' },
    sanction_letter: { file: 'Sanction_Letter_Rs_13Cr_Consortium.pdf', page: 2, method: 'vision' },
    mca_master: { file: 'MCA_Company_Master_Data_VROPL.pdf', page: 1, method: 'text' },
    cibil_company: { file: 'CIBIL_Commercial_Credit_Report_VROPL.pdf', page: 2, method: 'text' },
  };

  const { validations, flags } = runAllReconciliations({
    companyName: company.name,
    pan: company.pan,
    gstinList: company.gstinList,
    fyYears: company.fyYears,
    bankContinuityPercent: 99.8,
    bankClosingMarch31: 6818000,
    auditedCashAndBank: 6818000,
    annualGstOutward: 1040612000,
    auditedRevenue: 1040612000,
    eInvoiceTotal: 1024500000,
    gstr3bTaxableBranch: 1040612000,
    ledgerSalesTotal: 1040612000,
    ledgerBankTotal: 1424715480,
    bankTotalInflow: 1424715480,
    bsDebtors: 89000000,
    ledgerDebtors: 89000000,
    ageingDebtorsTotal: 89000000,
    ageingDebtorsOver180Days: 5200000,
    scheduledLoanEmi: 420000,
    bankEmiDebits: 420000,
    computedDscr: 1.74,
    covenantMinDscr: 1.25,
    computedTolTnw: 2.84,
    covenantMaxTolTnw: 3.50,
    cibilEnquiryCount90d: 5,
    nilExemptSharePercent: 28.0,
    operatingMarginPercent: 1.50,
    passThroughTxnCount: 4,
    passThroughAmountTotal: 18500000,
    lowBalanceChurnRatio: 0.985,
    unsecuredLoanFromVendor: 4500000,
    sourceRefs,
  });

  // 9. SWOT Analysis
  const swot = {
    strengths: [
      'Phenomenal top-line revenue expansion from ₹22.77 Cr (FY24) to ₹104.06 Cr (FY25) and ~₹173.00 Cr (FY26).',
      'Robust banking throughput of ~₹100.3 Cr annually with 99.8% mathematical balance delta continuity.',
      'Strong DSCR of 1.74x comfortably beating minimum sanctioned covenant threshold of 1.25x.',
      'Institutional tier-1 corporate customer off-take including Godrej Agrovet, Gemini Edibles, and Adani Wilmar.',
      'Clean credit bureau track record: CMR-3 rating, 738 commercial CIBIL score with 0 DPD and no historical defaults.',
    ],
    weaknesses: [
      'Thin operating margin (EBITDA 3.43%, Net Profit Margin 1.50%) characteristic of bulk edible oil refining.',
      'High balance-sheet leverage with TOL/TNW at 2.84x and Total Debt of ₹9.25 Cr against TNW of ₹4.70 Cr.',
      'High banking turnover churning with low average daily balance (~₹14.85 L) relative to throughput.',
      'Working capital limit CC/OD utilization is elevated at 78.4% to 84.2%.',
    ],
    opportunities: [
      'Enhanced working capital sanction to ₹13.00 Cr (₹5 Cr existing + ₹8 Cr new) will expand refinery throughput.',
      'Expansion into branded consumer packaging will lift gross refining margins from 4% towards 8%.',
      'Export opportunities for de-oiled rice bran cake and fractional fatty acids through Kakinada deepwater port.',
    ],
    threats: [
      'Raw crude palm oil price volatility linked to international benchmark tariffs (MDEX) and import duty fluctuations.',
      'Sticky receivables: ₹52 Lakhs (5.8% of book debts) are older than 180 days and excluded from Drawing Power.',
      'Counterparty concentration: top 3 off-takers represent 55.77% of total sales.',
      'Unsecured borrowings of ₹45 Lakhs from commercial trading associate require formal subordination and clean NOC.',
    ],
    executiveVerdict:
      'Venkata Ramana Oils Private Limited is a high-growth edible oil processing company with proven revenue scaling and sound debt service capability (DSCR 1.74x). Recommend sanction of ₹13.00 Cr consortium credit facility subject to strict subordination of promoter unsecured loans, monthly drawing power audit excluding >180-day debtors, and quarterly monitoring of operating margins.',
  };

  const sourceMap = Object.values(sourceRefs);

  return {
    company,
    files,
    gstReturns,
    gstBuyers,
    gstSuppliers,
    bankAccounts,
    bankMonthly,
    bankTransactions,
    plLines,
    bsLines,
    ratios,
    validations,
    flags,
    swot,
    sourceMap,
  };
}
