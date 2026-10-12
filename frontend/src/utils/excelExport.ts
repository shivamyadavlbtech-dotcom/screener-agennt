import * as XLSX from 'xlsx';
import { ScreenerCompanyData, TableData } from '../types/screener';

function buildSheetFromTableData(table?: TableData, subtitle?: string): (string | number | null)[][] {
  if (!table || !table.rows || table.rows.length === 0) {
    return [[subtitle || 'Not Available']];
  }

  const result: (string | number | null)[][] = [];

  if (subtitle) {
    result.push([subtitle]);
    result.push([]); // blank separator
  }

  // Header row
  const headerRow: (string | number | null)[] = ['Metric', ...table.headers.slice(1)];
  result.push(headerRow);

  // Data rows and their sub-rows
  table.rows.forEach((r) => {
    const rowCells: (string | number | null)[] = [r.label];
    r.values.forEach((v) => {
      rowCells.push(v);
    });
    result.push(rowCells);

    // If row has sub-rows, output them directly underneath indented
    if (r.subRows && r.subRows.length > 0) {
      r.subRows.forEach((sub) => {
        const subCells: (string | number | null)[] = [`   ↳ ${sub.label}`];
        sub.values.forEach((v) => {
          subCells.push(v);
        });
        result.push(subCells);
      });
    }
  });

  return result;
}

export function exportCompanyToExcel(data: ScreenerCompanyData): void {
  const wb = XLSX.utils.book_new();

  // 1. Overview Sheet
  const overviewRows: (string | number | null)[][] = [
    ['Company Overview & Key Ratios'],
    ['Name', data.name],
    ['Ticker / Symbol', data.symbol],
    ['CIN Number', data.cin || 'Not available'],
    ['Sector', data.sector || 'N/A'],
    ['Industry', data.industry || 'N/A'],
    ['Website', data.website || 'N/A'],
    ['BSE Code', data.bseCode || 'N/A'],
    ['NSE Symbol', data.nseCode || 'N/A'],
    [],
    ['Key Ratios', 'Value', 'Numeric', 'Unit'],
  ];

  data.topRatios.forEach((r) => {
    overviewRows.push([r.name, r.value, r.rawNumber ?? null, r.unit || '']);
  });

  overviewRows.push([]);
  overviewRows.push(['About']);
  overviewRows.push([data.about || 'N/A']);

  if (data.pros.length > 0 || data.cons.length > 0) {
    overviewRows.push([]);
    overviewRows.push(['Key Insights (Pros & Cons)']);
    data.pros.forEach((p) => overviewRows.push(['Pros', p]));
    data.cons.forEach((c) => overviewRows.push(['Cons', c]));
  }

  const overviewSheet = XLSX.utils.aoa_to_sheet(overviewRows);
  XLSX.utils.book_append_sheet(wb, overviewSheet, 'Overview');

  // 2. Peers Sheet
  if (data.peers && data.peers.rows.length > 0) {
    const peerRows: (string | number | null)[][] = [
      ['Peer Comparison Table'],
      [],
      data.peers.headers,
    ];

    data.peers.rows.forEach((row) => {
      const cells: (string | number | null)[] = [];
      data.peers!.headers.forEach((h, idx) => {
        const val = row[h] ?? row[`Col_${idx}`] ?? null;
        cells.push(val);
      });
      peerRows.push(cells);
    });

    const peerSheet = XLSX.utils.aoa_to_sheet(peerRows);
    XLSX.utils.book_append_sheet(wb, peerSheet, 'Peers');
  }

  // 3. Consolidated Tables
  if (data.consolidated?.available) {
    if (data.consolidated.quarters) {
      const qRows = buildSheetFromTableData(data.consolidated.quarters, `Quarterly Results (Consolidated) - ${data.consolidated.unitNotice || ''}`);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qRows), 'Quarters (Cons)');
    }
    if (data.consolidated.profitAndLoss) {
      const plRows = buildSheetFromTableData(data.consolidated.profitAndLoss, `Profit & Loss (Consolidated) - ${data.consolidated.unitNotice || ''}`);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plRows), 'P&L (Cons)');
    }
    if (data.consolidated.balanceSheet) {
      const bsRows = buildSheetFromTableData(data.consolidated.balanceSheet, `Balance Sheet (Consolidated) - ${data.consolidated.unitNotice || ''}`);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bsRows), 'Balance Sheet (Cons)');
    }
    if (data.consolidated.cashFlow) {
      const cfRows = buildSheetFromTableData(data.consolidated.cashFlow, `Cash Flows (Consolidated) - ${data.consolidated.unitNotice || ''}`);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cfRows), 'Cash Flows (Cons)');
    }
    if (data.consolidated.ratios) {
      const rRows = buildSheetFromTableData(data.consolidated.ratios, 'Ratios (Consolidated)');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rRows), 'Ratios (Cons)');
    }
  }

  // 4. Standalone Tables
  if (data.standalone?.available) {
    if (data.standalone.quarters) {
      const qRows = buildSheetFromTableData(data.standalone.quarters, `Quarterly Results (Standalone) - ${data.standalone.unitNotice || ''}`);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(qRows), 'Quarters (Standalone)');
    }
    if (data.standalone.profitAndLoss) {
      const plRows = buildSheetFromTableData(data.standalone.profitAndLoss, `Profit & Loss (Standalone) - ${data.standalone.unitNotice || ''}`);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plRows), 'P&L (Standalone)');
    }
    if (data.standalone.balanceSheet) {
      const bsRows = buildSheetFromTableData(data.standalone.balanceSheet, `Balance Sheet (Standalone) - ${data.standalone.unitNotice || ''}`);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bsRows), 'Balance Sheet (Standalone)');
    }
    if (data.standalone.cashFlow) {
      const cfRows = buildSheetFromTableData(data.standalone.cashFlow, `Cash Flows (Standalone) - ${data.standalone.unitNotice || ''}`);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cfRows), 'Cash Flows (Standalone)');
    }
    if (data.standalone.ratios) {
      const rRows = buildSheetFromTableData(data.standalone.ratios, 'Ratios (Standalone)');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rRows), 'Ratios (Standalone)');
    }
  }

  // 5. Shareholding Pattern
  const primaryFin = data.consolidated?.available ? data.consolidated : data.standalone;
  if (primaryFin?.shareholdingQuarterly || primaryFin?.shareholdingYearly) {
    const shpRows: (string | number | null)[][] = [['Shareholding Pattern'], []];

    if (primaryFin.shareholdingQuarterly) {
      shpRows.push(['Quarterly Shareholding (Numbers in %)']);
      const qHeaders = ['Category', ...primaryFin.shareholdingQuarterly.headers.slice(1)];
      shpRows.push(qHeaders);
      primaryFin.shareholdingQuarterly.rows.forEach((r) => {
        shpRows.push([r.label, ...r.values]);
        if (r.subRows && r.subRows.length > 0) {
          r.subRows.forEach((sub) => {
            shpRows.push([`   ↳ ${sub.label}`, ...sub.values]);
          });
        }
      });
      shpRows.push([]);
    }

    if (primaryFin.shareholdingYearly) {
      shpRows.push(['Yearly Shareholding (Numbers in %)']);
      const yHeaders = ['Category', ...primaryFin.shareholdingYearly.headers.slice(1)];
      shpRows.push(yHeaders);
      primaryFin.shareholdingYearly.rows.forEach((r) => {
        shpRows.push([r.label, ...r.values]);
        if (r.subRows && r.subRows.length > 0) {
          r.subRows.forEach((sub) => {
            shpRows.push([`   ↳ ${sub.label}`, ...sub.values]);
          });
        }
      });
    }

    const shpSheet = XLSX.utils.aoa_to_sheet(shpRows);
    XLSX.utils.book_append_sheet(wb, shpSheet, 'Shareholding');
  }

  // 6. Compounded Growth (CAGR)
  const growthList = data.consolidated?.growthRanges || data.standalone?.growthRanges;
  if (growthList && growthList.length > 0) {
    const grRows: (string | number | null)[][] = [['Compounded Growth & Returns'], []];
    growthList.forEach((g) => {
      grRows.push([g.title]);
      g.items.forEach((it) => {
        grRows.push([it.label, it.value]);
      });
      grRows.push([]);
    });

    const grSheet = XLSX.utils.aoa_to_sheet(grRows);
    XLSX.utils.book_append_sheet(wb, grSheet, 'Growth & CAGR');
  }

  // 7. Documents Sheet
  const docRows: (string | number | null)[][] = [
    ['Company Disclosures & Documents'],
    [],
    ['Category', 'Title / Description', 'Date / Info', 'URL'],
  ];

  data.documents.annualReports.forEach((ar) => {
    docRows.push(['Annual Report', ar.title, '', ar.url]);
  });
  data.documents.concalls.forEach((cc) => {
    docRows.push(['Earnings Concall', cc.title, cc.type || '', cc.url]);
  });
  data.documents.announcements.forEach((an) => {
    docRows.push(['Announcement', an.title, an.date || '', an.url]);
  });
  data.documents.creditRatings.forEach((cr) => {
    docRows.push(['Credit Rating', cr.title, cr.date || cr.agency || '', cr.url]);
  });

  const docSheet = XLSX.utils.aoa_to_sheet(docRows);
  XLSX.utils.book_append_sheet(wb, docSheet, 'Documents');

  // Trigger browser download
  const cleanName = data.symbol || data.name.replace(/[^a-zA-Z0-9]/g, '_');
  XLSX.writeFile(wb, `${cleanName}_Screener_Full_Data.xlsx`);
}

export function exportCompanyToJson(data: ScreenerCompanyData): void {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const cleanName = data.symbol || data.name.replace(/[^a-zA-Z0-9]/g, '_');
  a.download = `${cleanName}_Screener_Data.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
