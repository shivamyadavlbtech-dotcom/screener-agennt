import React, { useState } from 'react';
import {
  FileText,
  Download,
  Search,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Calendar,
  Layers,
  Info,
  Clock,
  Shield,
  HelpCircle,
} from 'lucide-react';
import { CddDataset, SourceRef, FinancialRatioItem } from '../types/cdd';
import { formatIndianCurrency, formatRatio } from '../engine/parsers';
import { buildFinancialWorkbook, downloadWorkbook } from '../engine/excelExporter';

interface FinancialDomainViewProps {
  dataset: CddDataset;
  onInspectSource: (source: SourceRef, name: string, val: string) => void;
}

export const FinancialDomainView: React.FC<FinancialDomainViewProps> = ({ dataset, onInspectSource }) => {
  const [activeSubTab, setActiveSubTab] = useState<'ratios' | 'pl' | 'bs' | 'debt' | 'ageing'>('ratios');
  const [ratioSearch, setRatioSearch] = useState('');
  const [selectedRatioCategory, setSelectedRatioCategory] = useState<string>('ALL');

  const { company, plLines, bsLines, ratios } = dataset;

  const filteredRatios = ratios.filter((r) => {
    const matchesCategory = selectedRatioCategory === 'ALL' || r.category === selectedRatioCategory;
    const matchesSearch =
      r.name.toLowerCase().includes(ratioSearch.toLowerCase()) ||
      r.formula.toLowerCase().includes(ratioSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleExportFinancialExcel = () => {
    const wb = buildFinancialWorkbook(dataset);
    downloadWorkbook(wb, `Financial_${company.name}`);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
              <FileText className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-slate-900 text-base">Financial Domain &amp; 25 CDD Ratios Engine</h3>
            <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
              Standardized 3-Year Audited Statements
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Standardized P&amp;L, Balance Sheet, all 25 Credit Due Diligence parameters calculated deterministically with formulas and benchmarks.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportFinancialExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Financial.xlsx (9 Sheets)</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 text-xs font-semibold text-slate-600">
        <button
          onClick={() => setActiveSubTab('ratios')}
          className={`pb-2.5 px-3 transition-colors border-b-2 ${
            activeSubTab === 'ratios' ? 'border-emerald-600 text-emerald-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          All 25 CDD Parameters ({ratios.length})
        </button>
        <button
          onClick={() => setActiveSubTab('pl')}
          className={`pb-2.5 px-3 transition-colors border-b-2 ${
            activeSubTab === 'pl' ? 'border-emerald-600 text-emerald-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Standardized P&amp;L Statement
        </button>
        <button
          onClick={() => setActiveSubTab('bs')}
          className={`pb-2.5 px-3 transition-colors border-b-2 ${
            activeSubTab === 'bs' ? 'border-emerald-600 text-emerald-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Standardized Balance Sheet
        </button>
        <button
          onClick={() => setActiveSubTab('debt')}
          className={`pb-2.5 px-3 transition-colors border-b-2 ${
            activeSubTab === 'debt' ? 'border-emerald-600 text-emerald-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Debt Facilities &amp; Covenants
        </button>
        <button
          onClick={() => setActiveSubTab('ageing')}
          className={`pb-2.5 px-3 transition-colors border-b-2 ${
            activeSubTab === 'ageing' ? 'border-emerald-600 text-emerald-600' : 'border-transparent hover:text-slate-900'
          }`}
        >
          Debtor &amp; Creditor Ageing
        </button>
      </div>

      {/* Sub Tab 1: All 25 CDD Parameters Table */}
      {activeSubTab === 'ratios' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Controls */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search 25 parameters & formulas..."
                  value={ratioSearch}
                  onChange={(e) => setRatioSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 bg-white border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <select
                value={selectedRatioCategory}
                onChange={(e) => setSelectedRatioCategory(e.target.value)}
                className="bg-white border border-slate-200 rounded px-2.5 py-1 text-slate-700 outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="ALL">All Categories</option>
                <option value="Profitability">Profitability</option>
                <option value="Solvency & Leverage">Solvency &amp; Leverage</option>
                <option value="Coverage">Debt Coverage</option>
                <option value="Liquidity">Liquidity</option>
                <option value="Working Capital">Working Capital</option>
                <option value="Banking & Turnover">Banking &amp; Turnover</option>
              </select>
            </div>

            <span className="text-[11px] text-slate-500 font-medium">
              Showing <strong>{filteredRatios.length}</strong> of 25 parameters
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Parameter Name</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Deterministic Formula</th>
                  <th className="py-2.5 px-3">Benchmark</th>
                  <th className="py-2.5 px-3 text-right">FY 2023-24</th>
                  <th className="py-2.5 px-3 text-right">FY 2024-25</th>
                  <th className="py-2.5 px-3 text-right">FY 2025-26 (P)</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRatios.map((r) => (
                  <tr key={r.id} className="hover:bg-emerald-50/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-400">{r.id}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      <div>{r.name}</div>
                      <div className="text-[10px] text-slate-400 font-sans font-normal mt-0.5">{r.interpretation}</div>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-700">
                        {r.category}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 max-w-xs truncate" title={r.formula}>
                      {r.formula}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] font-semibold text-slate-800 whitespace-nowrap">
                      {r.benchmark}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-700">
                      {formatRatio(r.fyValues['FY23-24'], r.unit)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                      {formatRatio(r.fyValues['FY24-25'], r.unit)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                      {formatRatio(r.fyValues['FY25-26'], r.unit)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          r.status === 'HEALTHY'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : r.status === 'MODERATE'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub Tab 2: Standardized P&L Statement */}
      {activeSubTab === 'pl' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Statement Line Item</th>
                  <th className="py-2.5 px-3">Standard Classification</th>
                  <th className="py-2.5 px-4 text-right">FY 2023-24 (Audited)</th>
                  <th className="py-2.5 px-4 text-right">FY 2024-25 (Audited)</th>
                  <th className="py-2.5 px-4 text-right">FY 2025-26 (Provisional)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                {plLines.map((line, idx) => (
                  <tr
                    key={idx}
                    className={`${line.isSubtotal ? 'bg-slate-50/80 font-bold text-slate-900 border-t border-slate-300' : 'hover:bg-slate-50'}`}
                  >
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-900">
                      {line.label}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-400 text-[10px]">
                      {line.standardKey}
                    </td>
                    <td
                      onClick={() => onInspectSource(line.source, `${line.label} (FY24)`, formatIndianCurrency(line.values['FY23-24']))}
                      className="py-2.5 px-4 text-right hover:text-emerald-700 cursor-pointer"
                    >
                      {formatIndianCurrency(line.values['FY23-24'])}
                    </td>
                    <td
                      onClick={() => onInspectSource(line.source, `${line.label} (FY25)`, formatIndianCurrency(line.values['FY24-25']))}
                      className="py-2.5 px-4 text-right font-bold text-slate-900 hover:text-emerald-700 cursor-pointer"
                    >
                      {formatIndianCurrency(line.values['FY24-25'])}
                    </td>
                    <td
                      onClick={() => onInspectSource(line.source, `${line.label} (FY26)`, formatIndianCurrency(line.values['FY25-26']))}
                      className="py-2.5 px-4 text-right font-bold text-emerald-800 hover:text-emerald-600 cursor-pointer"
                    >
                      {formatIndianCurrency(line.values['FY25-26'])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub Tab 3: Standardized Balance Sheet */}
      {activeSubTab === 'bs' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Balance Sheet Line Item</th>
                  <th className="py-2.5 px-3">Standard Classification</th>
                  <th className="py-2.5 px-4 text-right">FY 2023-24</th>
                  <th className="py-2.5 px-4 text-right">FY 2024-25</th>
                  <th className="py-2.5 px-4 text-right">FY 2025-26</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-mono text-[11px]">
                {bsLines.map((line, idx) => (
                  <tr
                    key={idx}
                    className={`${line.isSubtotal ? 'bg-slate-50/80 font-bold text-slate-900 border-t border-slate-300' : 'hover:bg-slate-50'}`}
                  >
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-900">
                      {line.label}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-400 text-[10px]">
                      {line.standardKey}
                    </td>
                    <td
                      onClick={() => onInspectSource(line.source, `${line.label} (FY24)`, formatIndianCurrency(line.values['FY23-24']))}
                      className="py-2.5 px-4 text-right hover:text-emerald-700 cursor-pointer"
                    >
                      {formatIndianCurrency(line.values['FY23-24'])}
                    </td>
                    <td
                      onClick={() => onInspectSource(line.source, `${line.label} (FY25)`, formatIndianCurrency(line.values['FY24-25']))}
                      className="py-2.5 px-4 text-right font-bold text-slate-900 hover:text-emerald-700 cursor-pointer"
                    >
                      {formatIndianCurrency(line.values['FY24-25'])}
                    </td>
                    <td
                      onClick={() => onInspectSource(line.source, `${line.label} (FY26)`, formatIndianCurrency(line.values['FY25-26']))}
                      className="py-2.5 px-4 text-right font-bold text-emerald-800 hover:text-emerald-600 cursor-pointer"
                    >
                      {formatIndianCurrency(line.values['FY25-26'])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub Tab 4: Debt & Covenants */}
      {activeSubTab === 'debt' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
            <h4 className="font-bold text-slate-900 text-sm mb-3">Sanctioned Debt Facilities Schedule</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Lender</th>
                    <th className="py-2.5 px-3">Facility Type</th>
                    <th className="py-2.5 px-3 text-right">Sanctioned Limit</th>
                    <th className="py-2.5 px-3 text-right">Outstanding (FY25)</th>
                    <th className="py-2.5 px-3">Pricing / ROI</th>
                    <th className="py-2.5 px-3">Security Charge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">YES Bank Ltd</td>
                    <td className="py-2.5 px-3">Working Capital CC / OD</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 8.00 Cr</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-700">₹ 6.85 Cr</td>
                    <td className="py-2.5 px-3">9.25% p.a.</td>
                    <td className="py-2.5 px-3 text-slate-500">First charge on raw crude oil stocks &amp; book debts</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">HDFC Bank Ltd</td>
                    <td className="py-2.5 px-3">Working Capital CC</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 5.00 Cr</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-indigo-700">₹ 3.92 Cr</td>
                    <td className="py-2.5 px-3">9.40% p.a.</td>
                    <td className="py-2.5 px-3 text-slate-500">Pari-passu charge on current assets with YES Bank</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">Promoter Directors</td>
                    <td className="py-2.5 px-3">Subordinated Long-Term Loan</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 2.40 Cr</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 2.40 Cr</td>
                    <td className="py-2.5 px-3">Interest-Free</td>
                    <td className="py-2.5 px-3 text-emerald-700 font-semibold">Subordinated to Bank Consortium</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 5: Ageing Breakdown */}
      {activeSubTab === 'ageing' && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h4 className="font-bold text-slate-900 text-sm mb-3">Receivables &amp; Payables Ageing Analysis</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Ageing Bucket</th>
                  <th className="py-2.5 px-3 text-right">Trade Debtors</th>
                  <th className="py-2.5 px-3 text-right">Debtor Share</th>
                  <th className="py-2.5 px-3 text-right">Trade Creditors</th>
                  <th className="py-2.5 px-3 text-center">Drawing Power (DP) Admissibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">0 - 30 Days (Current)</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 4.85 Cr</td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">54.5%</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-800">₹ 3.20 Cr</td>
                  <td className="py-2.5 px-3 text-center font-bold text-emerald-700">ELIGIBLE FOR DP</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">31 - 90 Days</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 2.64 Cr</td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-700 font-semibold">29.7%</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-800">₹ 1.45 Cr</td>
                  <td className="py-2.5 px-3 text-center font-bold text-emerald-700">ELIGIBLE FOR DP</td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-semibold text-slate-900">91 - 180 Days</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">₹ 0.89 Cr</td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-700 font-semibold">10.0%</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-800">₹ 0.42 Cr</td>
                  <td className="py-2.5 px-3 text-center font-bold text-emerald-700">ELIGIBLE FOR DP</td>
                </tr>
                <tr className="bg-rose-50/50">
                  <td className="py-2.5 px-3 font-bold text-rose-900">&gt; 180 Days (Sticky / Delinquent)</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">₹ 52 Lakhs</td>
                  <td className="py-2.5 px-3 text-right font-mono text-rose-700 font-bold">5.8%</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-800">₹ 0.11 Cr</td>
                  <td className="py-2.5 px-3 text-center font-bold text-rose-700">
                    EXCLUDED FROM DP (Covenant Rule)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
