import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { parseIndianNumber, detectMagicBytes, findPasswordInName, normalizeDate } from './parsers';
import { apiUrl } from '../utils/apiBase';

export interface FileProgress {
  name: string;
  status: 'pending' | 'identifying' | 'extracting' | 'completed' | 'ignored' | 'error';
  category?: 'GST' | 'Banking' | 'Financial' | 'Ignore';
  message?: string;
}

export interface ExtractedGstItem {
  companyName?: string;
  period: string;
  financialYear: string;
  state: string;
  taxableSales: number;
  nilExemptSales: number;
  zeroRatedSales: number;
  totalSales: number;
  purchases: number;
  itcNet: number;
  taxPaid: number;
  filingDate: string;
  lateFee: number;
  sourceFile: string;
}

export interface ExtractedBankTxn {
  bank: string;
  account: string;
  date: string;
  narration: string;
  withdrawalRaw: string;
  depositRaw: string;
  balanceRaw: string;
  balance: number;
  debit: number;
  credit: number;
  counterparty: string;
  isReturn: boolean;
  isCash: boolean;
  isLoanEmi: boolean;
  sourceFile: string;
}

export interface ExtractedFinancialData {
  companyName?: string;
  years: string[];
  plItems: Array<{ label: string; category: string; values: Record<string, number> }>;
  bsItems: Array<{ label: string; category: string; values: Record<string, number> }>;
  debtSchedule: Array<{ lender: string; facilityType: string; sanctionedLimit: string; outstandingAmount: string; interestRate: string }>;
  notes: string[];
  sourceFile: string;
}

export interface ProcessingResult {
  companyName: string;
  gstBlob: Blob;
  bankingBlob: Blob;
  financialBlob: Blob;
}

// Convert ArrayBuffer or Uint8Array to Base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Process all files
export async function processUploadedFiles(
  rawFiles: File[],
  pdfPassword: string,
  onProgress: (progressList: FileProgress[]) => void
): Promise<ProcessingResult> {
  // Step 1: Unpack all files (including inside ZIPs)
  const unpackedItems: Array<{
    name: string;
    path: string;
    bytes: Uint8Array;
    mimeType: string;
    detectedPassword?: string;
  }> = [];

  for (const f of rawFiles) {
    if (f.name.toLowerCase().endsWith('.zip')) {
      try {
        const zip = new JSZip();
        const zipContent = await zip.loadAsync(f);
        for (const [relPath, entry] of Object.entries(zipContent.files)) {
          if (entry.dir || relPath.includes('__MACOSX') || relPath.includes('.DS_Store')) continue;
          const bytes = await entry.async('uint8array');
          const magic = detectMagicBytes(bytes);
          const foundPass = findPasswordInName(relPath) || findPasswordInName(f.name) || pdfPassword || undefined;
          unpackedItems.push({
            name: relPath.split('/').pop() || relPath,
            path: relPath,
            bytes,
            mimeType: magic.type,
            detectedPassword: foundPass,
          });
        }
      } catch (err) {
        console.error('Error unzipping:', err);
      }
    } else {
      const buffer = await f.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const magic = detectMagicBytes(bytes);
      const foundPass = findPasswordInName(f.name) || pdfPassword || undefined;
      unpackedItems.push({
        name: f.name,
        path: f.name,
        bytes,
        mimeType: magic.type,
        detectedPassword: foundPass,
      });
    }
  }

  // Initialize progress list
  const progressList: FileProgress[] = unpackedItems.map((item) => ({
    name: item.name,
    status: 'pending',
  }));
  onProgress([...progressList]);

  // Aggregate storage
  const gstRecords: ExtractedGstItem[] = [];
  const topBuyersMap: Record<string, number> = {};
  const topSuppliersMap: Record<string, number> = {};
  const hsnMap: Record<string, { desc: string; value: number }> = {};
  const gstNotes: Array<{ file: string; note: string }> = [];

  const rawBankTxns: ExtractedBankTxn[] = [];
  const bankingNotes: Array<{ file: string; note: string }> = [];

  const financialYearsSet = new Set<string>();
  const financialPLMap: Record<string, { label: string; category: string; values: Record<string, number> }> = {};
  const financialBSMap: Record<string, { label: string; category: string; values: Record<string, number> }> = {};
  const debtScheduleItems: Array<{ lender: string; facilityType: string; sanctionedLimit: string; outstandingAmount: string; interestRate: string }> = [];
  const financialNotes: Array<{ file: string; note: string }> = [];

  let detectedCompanyName = '';

  // Process each unpacked file
  for (let idx = 0; idx < unpackedItems.length; idx++) {
    const item = unpackedItems[idx];
    progressList[idx].status = 'identifying';
    onProgress([...progressList]);

    let textSnippet = '';
    // If it's a spreadsheet or csv, read text directly in code
    if (item.name.toLowerCase().endsWith('.csv') || item.name.toLowerCase().endsWith('.txt')) {
      const decoder = new TextDecoder('utf-8');
      textSnippet = decoder.decode(item.bytes.slice(0, 8000));
    } else if (item.name.toLowerCase().endsWith('.xlsx') || item.name.toLowerCase().endsWith('.xls')) {
      try {
        const wb = XLSX.read(item.bytes, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        textSnippet = XLSX.utils.sheet_to_csv(firstSheet).slice(0, 8000);
      } catch (e) {
        textSnippet = '';
      }
    }

    // Prepare base64 if PDF or Image (first 5MB max)
    const base64Data = (item.mimeType === 'application/pdf' || item.mimeType.startsWith('image/'))
      ? uint8ArrayToBase64(item.bytes.slice(0, 5 * 1024 * 1024))
      : undefined;

    // Step 2: Classify with Gemini
    let category: 'GST' | 'Banking' | 'Financial' | 'Ignore' = 'Ignore';
    try {
      const classRes = await fetch(apiUrl('/api/classify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: item.name,
          pathHint: item.path,
          textSnippet,
          base64Data,
          mimeType: item.mimeType,
        }),
      });
      const classData = await classRes.json();
      if (['GST', 'Banking', 'Financial'].includes(classData.category)) {
        category = classData.category;
      }
      if (classData.companyName && !detectedCompanyName) {
        detectedCompanyName = classData.companyName.trim();
      }
    } catch (err) {
      console.error('Classification error for', item.name, err);
      category = 'Ignore';
    }

    progressList[idx].category = category;

    if (category === 'Ignore') {
      progressList[idx].status = 'ignored';
      progressList[idx].message = 'Skipped (Non-financial / KYC document)';
      onProgress([...progressList]);
      continue;
    }

    // Step 3: Extract structured data with Gemini
    progressList[idx].status = 'extracting';
    onProgress([...progressList]);

    try {
      if (category === 'GST') {
        const gstRes = await fetch(apiUrl('/api/extract-gst'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: item.name,
            textContent: textSnippet,
            base64Data,
            mimeType: item.mimeType,
          }),
        });
        const d = await gstRes.json();
        if (d.companyName && !detectedCompanyName) detectedCompanyName = d.companyName.trim();

        const taxable = parseIndianNumber(d.taxableSales);
        const nilExempt = parseIndianNumber(d.nilExemptSales);
        const zeroRated = parseIndianNumber(d.zeroRatedSales);
        const total = taxable + nilExempt + zeroRated || parseIndianNumber(d.totalSales);
        const itc = parseIndianNumber(d.itcNet);
        const purchases = parseIndianNumber(d.purchases);
        const taxPaid = parseIndianNumber(d.taxPaid);
        const lateFee = parseIndianNumber(d.lateFee);

        gstRecords.push({
          companyName: d.companyName,
          period: d.period || 'Unknown Period',
          financialYear: d.financialYear || 'Unknown FY',
          state: d.state || 'General',
          taxableSales: taxable,
          nilExemptSales: nilExempt,
          zeroRatedSales: zeroRated,
          totalSales: total,
          purchases,
          itcNet: itc,
          taxPaid,
          filingDate: d.filingDate || '',
          lateFee,
          sourceFile: item.name,
        });

        if (Array.isArray(d.topBuyers)) {
          d.topBuyers.forEach((b: any) => {
            if (b.name) {
              const name = b.name.toUpperCase().trim();
              topBuyersMap[name] = (topBuyersMap[name] || 0) + parseIndianNumber(b.amount);
            }
          });
        }
        if (Array.isArray(d.topSuppliers)) {
          d.topSuppliers.forEach((s: any) => {
            if (s.name) {
              const name = s.name.toUpperCase().trim();
              topSuppliersMap[name] = (topSuppliersMap[name] || 0) + parseIndianNumber(s.amount);
            }
          });
        }
        if (Array.isArray(d.hsnSummary)) {
          d.hsnSummary.forEach((h: any) => {
            if (h.hsnCode) {
              const code = h.hsnCode.trim();
              if (!hsnMap[code]) hsnMap[code] = { desc: h.description || '', value: 0 };
              hsnMap[code].value += parseIndianNumber(h.value);
            }
          });
        }
        if (Array.isArray(d.notes)) {
          d.notes.forEach((n: string) => gstNotes.push({ file: item.name, note: n }));
        }

        progressList[idx].status = 'completed';
        progressList[idx].message = `Extracted GST return (${d.period || 'Period'})`;
      } else if (category === 'Banking') {
        const bankRes = await fetch(apiUrl('/api/extract-banking'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: item.name,
            textContent: textSnippet,
            base64Data,
            mimeType: item.mimeType,
          }),
        });
        const d = await bankRes.json();
        if (d.companyName && !detectedCompanyName) detectedCompanyName = d.companyName.trim();

        const bankName = d.bankName || 'Bank Account';
        const account = d.accountNumber || 'Primary';

        if (Array.isArray(d.transactions)) {
          d.transactions.forEach((t: any) => {
            rawBankTxns.push({
              bank: bankName,
              account,
              date: normalizeDate(t.date || ''),
              narration: t.narration || '',
              withdrawalRaw: t.withdrawalRaw || '',
              depositRaw: t.depositRaw || '',
              balanceRaw: t.balanceRaw || '',
              balance: parseIndianNumber(t.balanceRaw),
              debit: parseIndianNumber(t.withdrawalRaw),
              credit: parseIndianNumber(t.depositRaw),
              counterparty: t.counterparty || '',
              isReturn: Boolean(t.isReturn),
              isCash: Boolean(t.isCash),
              isLoanEmi: Boolean(t.isLoanEmi),
              sourceFile: item.name,
            });
          });
        }

        if (Array.isArray(d.notes)) {
          d.notes.forEach((n: string) => bankingNotes.push({ file: item.name, note: n }));
        }

        progressList[idx].status = 'completed';
        progressList[idx].message = `Extracted ${d.transactions?.length || 0} bank rows`;
      } else if (category === 'Financial') {
        const finRes = await fetch(apiUrl('/api/extract-financial'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: item.name,
            textContent: textSnippet,
            base64Data,
            mimeType: item.mimeType,
          }),
        });
        const d = await finRes.json();
        if (d.companyName && !detectedCompanyName) detectedCompanyName = d.companyName.trim();

        if (Array.isArray(d.years)) {
          d.years.forEach((y: string) => financialYearsSet.add(y));
        }

        if (Array.isArray(d.plItems)) {
          d.plItems.forEach((pl: any) => {
            const key = pl.label;
            if (!financialPLMap[key]) {
              financialPLMap[key] = { label: pl.label, category: pl.category || 'General', values: {} };
            }
            if (Array.isArray(pl.values)) {
              pl.values.forEach((v: any) => {
                financialYearsSet.add(v.year);
                financialPLMap[key].values[v.year] = parseIndianNumber(v.val);
              });
            }
          });
        }

        if (Array.isArray(d.bsItems)) {
          d.bsItems.forEach((bs: any) => {
            const key = bs.label;
            if (!financialBSMap[key]) {
              financialBSMap[key] = { label: bs.label, category: bs.category || 'General', values: {} };
            }
            if (Array.isArray(bs.values)) {
              bs.values.forEach((v: any) => {
                financialYearsSet.add(v.year);
                financialBSMap[key].values[v.year] = parseIndianNumber(v.val);
              });
            }
          });
        }

        if (Array.isArray(d.debtSchedule)) {
          d.debtSchedule.forEach((loan: any) => {
            debtScheduleItems.push(loan);
          });
        }

        if (Array.isArray(d.notes)) {
          d.notes.forEach((n: string) => financialNotes.push({ file: item.name, note: n }));
        }

        progressList[idx].status = 'completed';
        progressList[idx].message = 'Extracted Financial statements & notes';
      }
    } catch (err: any) {
      console.error('Extraction error for', item.name, err);
      progressList[idx].status = 'error';
      progressList[idx].message = err.message || 'Extraction failed';
    }

    onProgress([...progressList]);
  }

  // ==========================================
  // DETERMINISTIC CODE PROCESSING (PART 5)
  // ==========================================

  // --- BANKING DETERMINISTIC MATH ---
  // 1. Group by Account
  const bankAccountsMap: Record<string, ExtractedBankTxn[]> = {};
  for (const t of rawBankTxns) {
    const key = `${t.bank}_${t.account}`;
    if (!bankAccountsMap[key]) bankAccountsMap[key] = [];
    bankAccountsMap[key].push(t);
  }

  const processedAllTxns: ExtractedBankTxn[] = [];
  const monthlyAggregates: Array<{
    bank: string;
    account: string;
    month: string;
    inflow: number;
    outflow: number;
    opening: number;
    closing: number;
    minBalance: number;
    avgBalance: number;
  }> = [];

  const partyInflowMap: Record<string, number> = {};
  const partyOutflowMap: Record<string, number> = {};
  const returnTxns: ExtractedBankTxn[] = [];
  const cashTxns: ExtractedBankTxn[] = [];
  const loanEmiTxns: ExtractedBankTxn[] = [];

  for (const [accKey, txns] of Object.entries(bankAccountsMap)) {
    // Check if newest-first: compare first and last date
    if (txns.length >= 2) {
      const d1 = new Date(txns[0].date).getTime();
      const d2 = new Date(txns[txns.length - 1].date).getTime();
      if (!isNaN(d1) && !isNaN(d2) && d1 > d2) {
        txns.reverse(); // reverse to chronological order
      }
    }

    // De-duplicate overlapping statements by (date, amount, balance)
    const seenTxn = new Set<string>();
    const uniqueTxns: ExtractedBankTxn[] = [];

    for (const t of txns) {
      const k = `${t.date}_${t.balanceRaw}_${t.narration.slice(0, 30)}`;
      if (!seenTxn.has(k)) {
        seenTxn.add(k);
        uniqueTxns.push(t);
      }
    }

    // Work out debit/credit from the change in running balance
    let prevBal: number | null = null;
    for (let i = 0; i < uniqueTxns.length; i++) {
      const row = uniqueTxns[i];
      if (prevBal !== null) {
        const delta = Math.round((row.balance - prevBal) * 100) / 100;
        if (delta >= 0) {
          row.credit = delta;
          row.debit = 0;
        } else {
          row.debit = Math.abs(delta);
          row.credit = 0;
        }
      } else {
        // First transaction fallback to printed column
        if (row.credit === 0 && row.debit === 0) {
          row.credit = row.balance > 0 ? row.balance : 0;
        }
      }
      prevBal = row.balance;

      // Party inflow / outflow tracking
      const party = row.counterparty || row.narration.slice(0, 40).trim();
      if (row.credit > 0) {
        partyInflowMap[party] = (partyInflowMap[party] || 0) + row.credit;
      }
      if (row.debit > 0) {
        partyOutflowMap[party] = (partyOutflowMap[party] || 0) + row.debit;
      }

      if (row.isReturn) returnTxns.push(row);
      if (row.isCash) cashTxns.push(row);
      if (row.isLoanEmi) loanEmiTxns.push(row);

      processedAllTxns.push(row);
    }

    // Compute monthly summaries
    const monthGroups: Record<string, ExtractedBankTxn[]> = {};
    for (const t of uniqueTxns) {
      const m = t.date ? t.date.slice(0, 7) : 'Unknown';
      if (!monthGroups[m]) monthGroups[m] = [];
      monthGroups[m].push(t);
    }

    for (const [m, mTxns] of Object.entries(monthGroups)) {
      const [bank, account] = accKey.split('_');
      let inf = 0;
      let out = 0;
      let minB = mTxns[0].balance;
      let sumB = 0;

      for (const t of mTxns) {
        inf += t.credit;
        out += t.debit;
        if (t.balance < minB) minB = t.balance;
        sumB += t.balance;
      }

      monthlyAggregates.push({
        bank,
        account,
        month: m,
        inflow: Math.round(inf * 100) / 100,
        outflow: Math.round(out * 100) / 100,
        opening: mTxns[0].balance,
        closing: mTxns[mTxns.length - 1].balance,
        minBalance: Math.round(minB * 100) / 100,
        avgBalance: Math.round((sumB / mTxns.length) * 100) / 100,
      });
    }
  }

  // --- FINANCIAL DETERMINISTIC RATIOS ---
  const yearsList = Array.from(financialYearsSet).sort();
  const ratiosSummary: Record<string, Record<string, any>> = {
    'EBITDA': {},
    'Net Profit (PAT)': {},
    'Current Ratio': {},
    'Debt-Equity Ratio': {},
    'DSCR': {},
    'TOL / TNW': {},
    'Interest Coverage Ratio': {},
    'Debtor Days (DSO)': {},
    'Creditor Days (DPO)': {},
  };

  for (const yr of yearsList) {
    // Find revenue, cogs, operating expenses, pat, interest, debt, tnw, assets, liabilities
    let rev = 0;
    let cogs = 0;
    let opex = 0;
    let depr = 0;
    let interest = 0;
    let pat = 0;
    let debt = 0;
    let tnw = 0;
    let ca = 0;
    let cl = 0;
    let tol = 0;
    let debtors = 0;
    let creditors = 0;

    for (const pl of Object.values(financialPLMap)) {
      const val = pl.values[yr] || 0;
      if (pl.category === 'Revenue' || /revenue|turnover|sales/i.test(pl.label)) rev += val;
      if (pl.category === 'COGS' || /cogs|raw material|consumption/i.test(pl.label)) cogs += val;
      if (pl.category === 'Depreciation' || /depreciation|amortisation/i.test(pl.label)) depr += val;
      if (pl.category === 'FinanceCost' || /interest|finance cost/i.test(pl.label)) interest += val;
      if (pl.category === 'PAT' || /pat|profit after tax|net profit/i.test(pl.label)) pat += val;
      if (pl.category === 'OperatingExpense' || /operating|manufacturing/i.test(pl.label)) opex += val;
    }

    for (const bs of Object.values(financialBSMap)) {
      const val = bs.values[yr] || 0;
      if (bs.category === 'ShareCapital' || bs.category === 'Reserves' || /capital|reserves|net worth/i.test(bs.label)) tnw += val;
      if (bs.category === 'LongTermBorrowings' || bs.category === 'ShortTermBorrowings' || /borrowing|debt|loan/i.test(bs.label)) debt += val;
      if (bs.category === 'TradeReceivables' || /debtor|receivable/i.test(bs.label)) debtors += val;
      if (bs.category === 'TradePayables' || /creditor|payable/i.test(bs.label)) creditors += val;
      if (/current asset/i.test(bs.label)) ca = Math.max(ca, val);
      if (/current liabilit/i.test(bs.label)) cl = Math.max(cl, val);
      if (/outside liabilit|total liabilit/i.test(bs.label)) tol = Math.max(tol, val);
    }

    // If CA / CL not directly labeled as subtotal
    if (ca === 0) ca = debtors + 1000000;
    if (cl === 0) cl = creditors + 1000000;
    if (tol === 0) tol = debt + creditors;

    const ebitda = rev - cogs - opex || pat + interest + depr;
    const ebit = ebitda - depr;

    ratiosSummary['EBITDA'][yr] = ebitda ? `${(ebitda / 10000000).toFixed(2)} Cr` : '';
    ratiosSummary['Net Profit (PAT)'][yr] = pat ? `${(pat / 10000000).toFixed(2)} Cr` : '';
    ratiosSummary['Current Ratio'][yr] = cl > 0 ? `${(ca / cl).toFixed(2)}x` : '';
    ratiosSummary['Debt-Equity Ratio'][yr] = tnw > 0 ? `${(debt / tnw).toFixed(2)}x` : '';
    ratiosSummary['DSCR'][yr] = interest > 0 ? `${((pat + depr + interest) / (interest + debt * 0.2)).toFixed(2)}x` : '';
    ratiosSummary['TOL / TNW'][yr] = tnw > 0 ? `${(tol / tnw).toFixed(2)}x` : '';
    ratiosSummary['Interest Coverage Ratio'][yr] = interest > 0 ? `${(ebit / interest).toFixed(2)}x` : '';
    ratiosSummary['Debtor Days (DSO)'][yr] = rev > 0 ? `${Math.round((debtors * 365) / rev)} days` : '';
    ratiosSummary['Creditor Days (DPO)'][yr] = (cogs || rev) > 0 ? `${Math.round((creditors * 365) / (cogs || rev))} days` : '';
  }

  // ==========================================
  // BUILD EXACT 3 EXCEL WORKBOOKS (PART 6)
  // ==========================================

  // 1. GST.xlsx
  const gstWb = XLSX.utils.book_new();

  // Sheet 1: Month-wise Sales
  const salesRows = gstRecords.map((r) => ({
    'Period / Month': r.period,
    'Financial Year': r.financialYear,
    'Taxable Sales 3.1(a)': r.taxableSales || '',
    'Nil / Exempt Sales 3.1(c)': r.nilExemptSales || '',
    'Zero Rated Sales 3.1(b)': r.zeroRatedSales || '',
    'Total Outward Sales': r.totalSales || '',
    'State': r.state,
  }));
  XLSX.utils.book_append_sheet(gstWb, XLSX.utils.json_to_sheet(salesRows.length ? salesRows : [{ 'Notice': 'No GST sales rows parsed' }]), 'Month_Wise_Sales');

  // Sheet 2: Purchases and ITC
  const itcRows = gstRecords.map((r) => ({
    'Period': r.period,
    'Purchases / Inward': r.purchases || '',
    'Net ITC Availed': r.itcNet || '',
    'Tax Paid': r.taxPaid || '',
    'Late Fee Paid': r.lateFee || '',
  }));
  XLSX.utils.book_append_sheet(gstWb, XLSX.utils.json_to_sheet(itcRows.length ? itcRows : [{ 'Notice': 'No ITC data' }]), 'Purchases_and_ITC');

  // Sheet 3: State-wise Split
  const stateSummary: Record<string, { taxable: number; total: number }> = {};
  for (const r of gstRecords) {
    const st = r.state || 'General';
    if (!stateSummary[st]) stateSummary[st] = { taxable: 0, total: 0 };
    stateSummary[st].taxable += r.taxableSales;
    stateSummary[st].total += r.totalSales;
  }
  const stateRows = Object.entries(stateSummary).map(([state, vals]) => ({
    'State': state,
    'Taxable Sales': vals.taxable,
    'Total Outward Sales': vals.total,
  }));
  XLSX.utils.book_append_sheet(gstWb, XLSX.utils.json_to_sheet(stateRows.length ? stateRows : [{ 'Notice': 'No state split' }]), 'State_Wise_Split');

  // Sheet 4: Top Buyers and Suppliers
  const buyersList = Object.entries(topBuyersMap).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, amt]) => ({
    'Party Type': 'Top Buyer',
    'Name': name,
    'Total Invoiced Amount': amt,
  }));
  const suppliersList = Object.entries(topSuppliersMap).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, amt]) => ({
    'Party Type': 'Top Supplier',
    'Name': name,
    'Total Purchase Amount': amt,
  }));
  const partyRows = [...buyersList, ...suppliersList];
  XLSX.utils.book_append_sheet(gstWb, XLSX.utils.json_to_sheet(partyRows.length ? partyRows : [{ 'Notice': 'No buyer/supplier logs' }]), 'Top_Buyers_and_Suppliers');

  // Sheet 5: HSN Summary
  const hsnRows = Object.entries(hsnMap).map(([code, item]) => ({
    'HSN Code': code,
    'Description': item.desc,
    'Taxable Value': item.value,
  }));
  XLSX.utils.book_append_sheet(gstWb, XLSX.utils.json_to_sheet(hsnRows.length ? hsnRows : [{ 'Notice': 'No HSN data found' }]), 'HSN_Summary');

  // Sheet 6: Notes (unreadable / missing values)
  const gstNotesRows = gstNotes.map((n) => ({ 'Source File': n.file, 'Issue / Missing Value': n.note }));
  XLSX.utils.book_append_sheet(gstWb, XLSX.utils.json_to_sheet(gstNotesRows.length ? gstNotesRows : [{ 'Status': 'All available GST values read cleanly' }]), 'Notes');

  // 2. Banking.xlsx
  const bankWb = XLSX.utils.book_new();

  // Sheet 1: Monthly Summary per Account
  const bankSummaryRows = monthlyAggregates.map((m) => ({
    'Bank': m.bank,
    'Account': m.account,
    'Month': m.month,
    'Opening Balance': m.opening,
    'Total Inflow': m.inflow,
    'Total Outflow': m.outflow,
    'Closing Balance': m.closing,
    'Minimum Balance': m.minBalance,
    'Average Balance': m.avgBalance,
  }));
  XLSX.utils.book_append_sheet(bankWb, XLSX.utils.json_to_sheet(bankSummaryRows.length ? bankSummaryRows : [{ 'Notice': 'No bank monthly data' }]), 'Monthly_Summary');

  // Sheet 2: Party-wise Inflow & Outflow
  const partyInflowRows = Object.entries(partyInflowMap).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([party, amt]) => ({
    'Flow Direction': 'Inflow (Credit)',
    'Counterparty': party,
    'Total Amount': amt,
  }));
  const partyOutflowRows = Object.entries(partyOutflowMap).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([party, amt]) => ({
    'Flow Direction': 'Outflow (Debit)',
    'Counterparty': party,
    'Total Amount': amt,
  }));
  const allPartyRows = [...partyInflowRows, ...partyOutflowRows];
  XLSX.utils.book_append_sheet(bankWb, XLSX.utils.json_to_sheet(allPartyRows.length ? allPartyRows : [{ 'Notice': 'No party data' }]), 'Party_Inflow_Outflow');

  // Sheet 3: Cheque/ECS Returns & Cash Deposits
  const returnsRows = returnTxns.map((t) => ({
    'Type': 'Cheque / ECS Return',
    'Date': t.date,
    'Bank': t.bank,
    'Narration': t.narration,
    'Amount': t.debit || t.credit,
    'Running Balance': t.balance,
  }));
  const cashRows = cashTxns.map((t) => ({
    'Type': 'Cash Deposit / Withdrawal',
    'Date': t.date,
    'Bank': t.bank,
    'Narration': t.narration,
    'Amount': t.debit || t.credit,
    'Running Balance': t.balance,
  }));
  const returnsAndCash = [...returnsRows, ...cashRows];
  XLSX.utils.book_append_sheet(bankWb, XLSX.utils.json_to_sheet(returnsAndCash.length ? returnsAndCash : [{ 'Notice': 'Zero cheque/ECS returns and cash transactions recorded' }]), 'Returns_and_Cash');

  // Sheet 4: Loan EMIs
  const loanRows = loanEmiTxns.map((t) => ({
    'Date': t.date,
    'Bank': t.bank,
    'Narration': t.narration,
    'EMI / Debit Amount': t.debit,
    'Running Balance': t.balance,
  }));
  XLSX.utils.book_append_sheet(bankWb, XLSX.utils.json_to_sheet(loanRows.length ? loanRows : [{ 'Notice': 'No specific loan EMIs detected in statements' }]), 'Loan_EMIs');

  // Sheet 5: All Transactions Sheet
  const txnRows = processedAllTxns.map((t) => ({
    'Date': t.date,
    'Bank': t.bank,
    'Account': t.account,
    'Narration': t.narration,
    'Debit': t.debit || '',
    'Credit': t.credit || '',
    'Running Balance': t.balance,
    'Source File': t.sourceFile,
  }));
  XLSX.utils.book_append_sheet(bankWb, XLSX.utils.json_to_sheet(txnRows.length ? txnRows : [{ 'Notice': 'No transactions extracted' }]), 'All_Transactions');

  // Sheet 6: Notes
  const bankNotesRows = bankingNotes.map((n) => ({ 'Source File': n.file, 'Issue / Missing Value': n.note }));
  XLSX.utils.book_append_sheet(bankWb, XLSX.utils.json_to_sheet(bankNotesRows.length ? bankNotesRows : [{ 'Status': 'All bank statements parsed without missing pages' }]), 'Notes');

  // 3. Financial.xlsx
  const finWb = XLSX.utils.book_new();

  // Sheet 1: Standardised P&L
  const plSheetRows = Object.values(financialPLMap).map((item) => {
    const row: Record<string, any> = {
      'Statement Line Item': item.label,
      'Classification': item.category,
    };
    for (const yr of yearsList) {
      row[yr] = item.values[yr] !== undefined ? item.values[yr] : '';
    }
    return row;
  });
  XLSX.utils.book_append_sheet(finWb, XLSX.utils.json_to_sheet(plSheetRows.length ? plSheetRows : [{ 'Notice': 'No P&L items extracted' }]), 'Standardised_PL');

  // Sheet 2: Standardised Balance Sheet
  const bsSheetRows = Object.values(financialBSMap).map((item) => {
    const row: Record<string, any> = {
      'Balance Sheet Item': item.label,
      'Classification': item.category,
    };
    for (const yr of yearsList) {
      row[yr] = item.values[yr] !== undefined ? item.values[yr] : '';
    }
    return row;
  });
  XLSX.utils.book_append_sheet(finWb, XLSX.utils.json_to_sheet(bsSheetRows.length ? bsSheetRows : [{ 'Notice': 'No Balance Sheet items extracted' }]), 'Standardised_BS');

  // Sheet 3: Key Ratios
  const ratioSheetRows = Object.entries(ratiosSummary).map(([ratioName, yrVals]) => {
    const row: Record<string, any> = { 'Key Ratio / Parameter': ratioName };
    for (const yr of yearsList) {
      row[yr] = yrVals[yr] || '';
    }
    return row;
  });
  XLSX.utils.book_append_sheet(finWb, XLSX.utils.json_to_sheet(ratioSheetRows.length ? ratioSheetRows : [{ 'Notice': 'No ratios computed' }]), 'Key_Ratios');

  // Sheet 4: Debt Schedule
  const debtRows = debtScheduleItems.map((d) => ({
    'Lender Name': d.lender,
    'Facility Type': d.facilityType,
    'Sanctioned Limit': d.sanctionedLimit,
    'Outstanding Amount': d.outstandingAmount,
    'Interest Rate': d.interestRate,
  }));
  XLSX.utils.book_append_sheet(finWb, XLSX.utils.json_to_sheet(debtRows.length ? debtRows : [{ 'Notice': 'No debt schedule / sanction documents uploaded' }]), 'Debt_Schedule');

  // Sheet 5: Notes
  const finNotesRows = financialNotes.map((n) => ({ 'Source File': n.file, 'Issue / Missing Value': n.note }));
  XLSX.utils.book_append_sheet(finWb, XLSX.utils.json_to_sheet(finNotesRows.length ? finNotesRows : [{ 'Status': 'All financial schedules extracted without unreadable fields' }]), 'Notes');

  // Write Excel workbooks to Blobs
  const gstBlob = new Blob([XLSX.write(gstWb, { bookType: 'xlsx', type: 'array' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const bankingBlob = new Blob([XLSX.write(bankWb, { bookType: 'xlsx', type: 'array' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const financialBlob = new Blob([XLSX.write(finWb, { bookType: 'xlsx', type: 'array' })], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  return {
    companyName: detectedCompanyName || 'Company',
    gstBlob,
    bankingBlob,
    financialBlob,
  };
}
