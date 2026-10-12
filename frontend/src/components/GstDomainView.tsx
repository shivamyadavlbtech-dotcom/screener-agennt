import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Building,
  FileCheck,
  Calendar,
  Layers,
  Sparkles,
} from 'lucide-react';
import { CddDataset, SourceRef, GstReturnRow } from '../types/cdd';
import { formatIndianCurrency, formatCompactCurrency } from '../engine/parsers';
import { buildGstWorkbook, downloadWorkbook } from '../engine/excelExporter';

interface GstDomainViewProps {
  dataset: CddDataset;
  onInspectSource: (source: SourceRef, name: string, val: string) => void;
}

export const GstDomainView: React.FC<GstDomainViewProps> = ({ dataset, onInspectSource }) => {
  const [selectedGstin, setSelectedGstin] = useState<string>('ALL');
  const [selectedFy, setSelectedFy] = useState<string>('ALL');
  const [activeSubTab, setActiveSubTab] = useState<'returns' | 'parties' | 'hsn' | 'compliance'>('returns');

  const { company, gstReturns, gstBuyers, gstSuppliers } = dataset;

  const filteredReturns = gstReturns.filter((r) => {
    const matchesGstin = selectedGstin === 'ALL' || r.gstin === selectedGstin;
    const matchesFy = selectedFy === 'ALL' || r.financialYear === selectedFy;
    return matchesGstin && matchesFy;
  });

  const totalTaxable = filteredReturns.reduce((acc, r) => acc + r.taxable_3_1a, 0);
  const totalNilExempt = filteredReturns.reduce((acc, r) => acc + r.nilExempt_3_1c, 0);
  const totalOutward = filteredReturns.reduce((acc, r) => acc + r.totalOutward, 0);
  const totalItc = filteredReturns.reduce((acc, r) => acc + r.totalItcNet, 0);

  const handleExportGstExcel = () => {
    const wb = buildGstWorkbook(dataset);
    downloadWorkbook(wb, `GST_${company.name}`);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-slate-900 text-base">GST Domain Analysis &amp; Reconciliation</h3>
            <span className="bg-blue-100 text-blue-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
              31 Returns across 3 States
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            GSTR-3B monthly filings, GSTR-1 outward turnover, buyer/supplier shares, HSN codes, and statutory compliance status.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportGstExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download GST.xlsx (7 Sheets)</span>
          </button>
        </div>
      </div>

      {/* 4 Summary Numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-slate-400 block">Total Outward Supplies</span>
          <span className="text-lg font-bold text-slate-900 font-mono mt-1 block">
            {formatIndianCurrency(totalOutward, true)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {formatIndianCurrency(totalOutward)}
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-slate-400 block">Taxable Supplies 3.1(a)</span>
          <span className="text-lg font-bold text-blue-700 font-mono mt-1 block">
            {formatIndianCurrency(totalTaxable, true)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block">
            {((totalTaxable / (totalOutward || 1)) * 100).toFixed(1)}% of total turnover
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-slate-400 block">Nil / Exempt Supplies 3.1(c)</span>
          <span className="text-lg font-bold text-amber-700 font-mono mt-1 block">
            {formatIndianCurrency(totalNilExempt, true)}
          </span>
          <span className="text-[11px] text-amber-700 mt-1 block">
            {((totalNilExempt / (totalOutward || 1)) * 100).toFixed(1)}% (Crude edible oil exemption)
          </span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-[11px] font-semibold uppercase text-slate-400 block">Net ITC Availed (Table 4)</span>
          <span className="text-lg font-bold text-emerald-700 font-mono mt-1 block">
            {formatIndianCurrency(totalItc, true)}
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block">
            IGST + CGST + SGST Net Credits
          </span>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 text-xs font-semibold text-slate-600">
        <button
          onClick={() => setActiveSubTab('returns')}
          className={`pb-2.5 px-3 transition-colors border-b-2 ${
            activeSubTab === 'returns' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Monthly GSTR-3B Table ({filteredReturns.length})
        </button>
        <button
          onClick={() => setActiveSubTab('parties')}
          className={`pb-2.5 px-3 transition-colors border-b-2 ${
            activeSubTab === 'parties' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Top Buyers &amp; Suppliers ({gstBuyers.length + gstSuppliers.length})
        </button>
        <button
          onClick={() => setActiveSubTab('hsn')}
          className={`pb-2.5 px-3 transition-colors border-b-2 ${
            activeSubTab === 'hsn' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          HSN Summary Breakdown
        </button>
        <button
          onClick={() => setActiveSubTab('compliance')}
          className={`pb-2.5 px-3 transition-colors border-b-2 ${
            activeSubTab === 'compliance' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Filing Compliance &amp; Late Fees
        </button>
      </div>

      {/* Sub Tab 1: Monthly Returns Table */}
      {activeSubTab === 'returns' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Filters */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 font-medium">State / GSTIN:</span>
                <select
                  value={selectedGstin}
                  onChange={(e) => setSelectedGstin(e.target.value)}
                  className="bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="ALL">All GSTINs (3 States)</option>
                  <option value="37AAECV2819N1ZZ">37AA... (Andhra Pradesh - Refinery)</option>
                  <option value="36AAECV2819N1ZZ">36AA... (Telangana - Depot)</option>
                  <option value="29AAECV2819N1ZZ">29AA... (Karnataka - Depot)</option>
                </select>
              </div>

              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 font-medium">Financial Year:</span>
                <select
                  value={selectedFy}
                  onChange={(e) => setSelectedFy(e.target.value)}
                  className="bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-700 outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                >
                  <option value="ALL">All Financial Years</option>
                  <option value="FY25-26">FY 2025-26 (~₹173 Cr)</option>
                  <option value="FY24-25">FY 2024-25 (₹104.06 Cr)</option>
                </select>
              </div>
            </div>

            <span className="text-[11px] text-slate-500">
              Click any value to inspect exact source page &amp; raw text
            </span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Period</th>
                  <th className="py-2.5 px-3">State &amp; GSTIN</th>
                  <th className="py-2.5 px-3 text-right">Taxable 3.1(a)</th>
                  <th className="py-2.5 px-3 text-right">IGST</th>
                  <th className="py-2.5 px-3 text-right">CGST</th>
                  <th className="py-2.5 px-3 text-right">SGST</th>
                  <th className="py-2.5 px-3 text-right">Nil / Exempt 3.1(c)</th>
                  <th className="py-2.5 px-3 text-right">Total Outward</th>
                  <th className="py-2.5 px-3 text-right">Net ITC</th>
                  <th className="py-2.5 px-3">ARN &amp; Date</th>
                  <th className="py-2.5 px-3">Filing Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                {filteredReturns.map((r, i) => (
                  <tr key={i} className="hover:bg-blue-50/40 transition-colors">
                    <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 whitespace-nowrap">
                      {r.period}
                    </td>
                    <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                      <span className="text-slate-900 font-medium block">{r.state}</span>
                      <span className="text-[10px] text-slate-400">{r.gstin}</span>
                    </td>
                    <td
                      onClick={() => onInspectSource(r.source, `${r.period} Taxable 3.1(a)`, formatIndianCurrency(r.taxable_3_1a))}
                      className="py-2.5 px-3 text-right text-blue-700 font-medium hover:underline cursor-pointer"
                    >
                      {formatIndianCurrency(r.taxable_3_1a)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{formatIndianCurrency(r.igst_3_1a)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{formatIndianCurrency(r.cgst_3_1a)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-600">{formatIndianCurrency(r.sgst_3_1a)}</td>
                    <td
                      onClick={() => onInspectSource(r.source, `${r.period} Nil/Exempt 3.1(c)`, formatIndianCurrency(r.nilExempt_3_1c))}
                      className="py-2.5 px-3 text-right text-amber-700 hover:underline cursor-pointer"
                    >
                      {formatIndianCurrency(r.nilExempt_3_1c)}
                    </td>
                    <td
                      onClick={() => onInspectSource(r.source, `${r.period} Total Outward`, formatIndianCurrency(r.totalOutward))}
                      className="py-2.5 px-3 text-right font-bold text-slate-900 hover:underline cursor-pointer"
                    >
                      {formatIndianCurrency(r.totalOutward)}
                    </td>
                    <td
                      onClick={() => onInspectSource(r.source, `${r.period} Net ITC Table 4`, formatIndianCurrency(r.totalItcNet))}
                      className="py-2.5 px-3 text-right text-emerald-700 font-semibold hover:underline cursor-pointer"
                    >
                      {formatIndianCurrency(r.totalItcNet)}
                    </td>
                    <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                      <span className="text-slate-900 block font-mono text-[10px]">{r.arn}</span>
                      <span className="text-[10px] text-slate-400">{r.arnDate}</span>
                    </td>
                    <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                      {r.isLate ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          Delayed (Late Fee: ₹{r.lateFee})
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          On Time
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub Tab 2: Top Buyers & Suppliers */}
      {activeSubTab === 'parties' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Buyers */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Top Buyers / Debtors (Share of Outward Sales)
              </h4>
              <span className="text-xs text-slate-400">Total Analyzed: ₹ 140.7 Cr</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2.5">Buyer Name</th>
                    <th className="py-2 px-2.5 text-right">Invoiced Amount</th>
                    <th className="py-2 px-2.5 text-right">Sales Share</th>
                    <th className="py-2 px-2.5 text-center">Related Party</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {gstBuyers.map((b, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-medium text-slate-900">
                        <div>{b.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{b.gstin} • {b.state}</div>
                      </td>
                      <td
                        onClick={() => onInspectSource(b.source, b.name, formatIndianCurrency(b.amount))}
                        className="py-2 px-2.5 text-right font-mono font-bold text-slate-900 hover:text-blue-600 cursor-pointer"
                      >
                        {formatIndianCurrency(b.amount, true)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-semibold text-blue-700">
                        {b.sharePercent.toFixed(2)}%
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        {b.isRelatedParty ? (
                          <span className="bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            YES (FLAG)
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">No</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Suppliers */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Top Crude Oil Suppliers / Creditors
              </h4>
              <span className="text-xs text-slate-400">Total Analyzed: ₹ 139.5 Cr</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2.5">Supplier Name</th>
                    <th className="py-2 px-2.5 text-right">Purchases</th>
                    <th className="py-2 px-2.5 text-right">Purchase Share</th>
                    <th className="py-2 px-2.5 text-center">Origin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {gstSuppliers.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="py-2 px-2.5 font-medium text-slate-900">
                        <div>{s.name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{s.gstin} • {s.state}</div>
                      </td>
                      <td
                        onClick={() => onInspectSource(s.source, s.name, formatIndianCurrency(s.amount))}
                        className="py-2 px-2.5 text-right font-mono font-bold text-slate-900 hover:text-blue-600 cursor-pointer"
                      >
                        {formatIndianCurrency(s.amount, true)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono font-semibold text-emerald-700">
                        {s.sharePercent.toFixed(2)}%
                      </td>
                      <td className="py-2 px-2.5 text-center text-slate-600 text-[11px]">
                        {s.state.includes('Import') ? 'Import (Kakinada Port)' : 'Domestic'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 3: HSN Summary */}
      {activeSubTab === 'hsn' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h4 className="font-bold text-slate-900 text-sm mb-3">Harmonized System Nomenclature (HSN) Summary</h4>
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">HSN Code</th>
                <th className="py-2.5 px-3">Commodity Description</th>
                <th className="py-2.5 px-3 text-right">Taxable Turnover</th>
                <th className="py-2.5 px-3 text-right">Share of Sales</th>
                <th className="py-2.5 px-3 text-right">GST Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              <tr>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">1511</td>
                <td className="py-2.5 px-3 font-medium">Palm Oil and its fractions (whether or not refined, but not chemically modified)</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 98.50 Cr</td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-700">56.9%</td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">5.0%</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">1512</td>
                <td className="py-2.5 px-3 font-medium">Sunflower seed, safflower or cotton-seed oil and fractions thereof</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 48.20 Cr</td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-700">27.8%</td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">5.0%</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">1515</td>
                <td className="py-2.5 px-3 font-medium">Other fixed vegetable fats and oils (including groundnut, mustard fractions)</td>
                <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 26.30 Cr</td>
                <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-700">15.2%</td>
                <td className="py-2.5 px-3 text-right font-semibold text-slate-900">5.0%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Sub Tab 4: Compliance */}
      {activeSubTab === 'compliance' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Statutory Tax Filing Track Record</h4>
              <p className="text-xs text-slate-500">
                Evaluation of regular GSTR-3B filings within statutory due dates (20th of subsequent month).
              </p>
            </div>
            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1 rounded-full text-xs font-bold">
              96.8% On-Time Filing Ratio
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <span className="text-slate-500 block">Total Filings Analyzed</span>
              <strong className="text-slate-900 text-base font-mono block mt-1">31 Returns</strong>
              <span className="text-[11px] text-slate-500 mt-1 block">Across AP, Telangana, and Karnataka</span>
            </div>
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <span className="text-slate-500 block">Delayed Filings</span>
              <strong className="text-amber-700 text-base font-mono block mt-1">1 Month (October 2024)</strong>
              <span className="text-[11px] text-amber-700 mt-1 block">Late fee of ₹2,500 settled promptly</span>
            </div>
            <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
              <span className="text-slate-500 block">Cumulative Late Fee &amp; Interest</span>
              <strong className="text-slate-900 text-base font-mono block mt-1">₹ 6,700</strong>
              <span className="text-[11px] text-emerald-600 mt-1 block">Zero outstanding statutory demand</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
