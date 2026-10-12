import React from 'react';
import {
  TrendingUp,
  CreditCard,
  PieChart,
  ShieldCheck,
  AlertTriangle,
  FileCheck2,
  Building,
  CheckCircle,
  HelpCircle,
  Scale,
  DollarSign,
  ArrowUpRight,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { CddDataset, SourceRef } from '../types/cdd';
import { formatIndianCurrency, formatCompactCurrency } from '../engine/parsers';

interface DashboardViewProps {
  dataset: CddDataset;
  onInspectSource: (source: SourceRef, name: string, val: string) => void;
  onNavigateTab: (tabId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dataset,
  onInspectSource,
  onNavigateTab,
}) => {
  const { company, bankAccounts, ratios, flags, validations, swot } = dataset;

  const fy25Turnover = 1040612000;
  const fy26Turnover = 1730000000;
  const bankingInflowTotal = bankAccounts.reduce((acc, b) => acc + b.totalCredits, 0);
  const primaryAccount = bankAccounts[0];

  const dscrRatio = ratios.find((r) => r.id === 6);
  const tolTnwRatio = ratios.find((r) => r.id === 12);
  const currentRatio = ratios.find((r) => r.id === 7);
  const patRatio = ratios.find((r) => r.id === 3);

  const criticalFlagsCount = flags.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;

  return (
    <div className="space-y-6">
      {/* Red Flags Alert Strip */}
      {criticalFlagsCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-100 rounded-lg text-amber-800 shrink-0">
              <ShieldAlert className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Credit Anomaly Alerts ({criticalFlagsCount} High / Critical Items Detected)
              </h4>
              <p className="text-xs text-amber-800 mt-0.5">
                Pass-through debits, turnover churning with low average balances, and &gt;180-day debtors identified during automated reconciliation.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('flags')}
            className="px-3.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs"
          >
            Review Audit Flags &amp; Reconciliations
          </button>
        </div>
      )}

      {/* 4 Executive KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Outward GST Turnover */}
        <div
          onClick={() =>
            onInspectSource(
              { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 18, method: 'vision', confidence: 0.99 },
              'Annual GST Outward Turnover (FY26 / FY25)',
              '₹ 173.00 Cr / ₹ 104.06 Cr'
            )
          }
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Outward GST Turnover
            </span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-xl font-bold text-slate-900 font-mono">
                {formatIndianCurrency(fy26Turnover, true)}
              </span>
              <span className="text-xs text-slate-400 ml-1.5 font-sans">(FY26 Prov)</span>
            </div>
            <span className="inline-flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> +66.2%
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>FY25 Audited: <strong>₹ 104.06 Cr</strong></span>
            <span className="text-indigo-600 font-medium group-hover:underline">Inspect Source</span>
          </div>
        </div>

        {/* Clean Banking Inflow */}
        <div
          onClick={() =>
            onInspectSource(
              primaryAccount.source,
              'Clean Banking Turnover (YES Bank & HDFC)',
              formatIndianCurrency(primaryAccount.totalTurnoverClean)
            )
          }
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Clean Banking Volume
            </span>
            <div className="p-1.5 rounded-lg bg-purple-50 text-purple-600 group-hover:scale-110 transition-transform">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-xl font-bold text-slate-900 font-mono">
                {formatIndianCurrency(bankingInflowTotal, true)}
              </span>
            </div>
            <span className="inline-flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              99.8% Balanced
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>Internal Transfers: <strong>₹ 2.20 Cr Net</strong></span>
            <span className="text-indigo-600 font-medium group-hover:underline">Inspect Source</span>
          </div>
        </div>

        {/* PAT & Net Margin */}
        <div
          onClick={() =>
            onInspectSource(
              { file: 'Audited_Financial_Statements_VROPL_FY24-25.pdf', page: 18, method: 'vision', confidence: 0.99 },
              'Profit After Tax (PAT)',
              '₹ 1.56 Cr (FY25)'
            )
          }
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Net Profit / PAT
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-xl font-bold text-slate-900 font-mono">₹ 1.56 Cr</span>
              <span className="text-xs text-slate-400 ml-1.5 font-sans">(FY25)</span>
            </div>
            <span className="inline-flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              1.50% Margin
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>FY24: <strong>₹ 9.74 L</strong> (16x Growth)</span>
            <span className="text-indigo-600 font-medium group-hover:underline">Inspect Source</span>
          </div>
        </div>

        {/* Debt Service Coverage (DSCR) */}
        <div
          onClick={() =>
            onInspectSource(
              { file: 'Sanction_Letter_Rs_13Cr_Consortium.pdf', page: 2, method: 'vision', confidence: 0.98 },
              'DSCR (Debt Service Coverage Ratio)',
              '1.74x'
            )
          }
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Debt Coverage (DSCR)
            </span>
            <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform">
              <Scale className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-xl font-bold text-emerald-700 font-mono">1.74x</span>
            </div>
            <span className="inline-flex items-center text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              Covenant &gt;= 1.25x
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2">
            <span>TOL / TNW: <strong>2.84x</strong> (Limit: 3.50x)</span>
            <span className="text-indigo-600 font-medium group-hover:underline">Inspect Source</span>
          </div>
        </div>
      </div>

      {/* Main Charts & Financial Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: 3-Year Revenue & Banking Turnover Progression */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h4 className="font-bold text-slate-900 text-sm">3-Year Growth &amp; Banking Reconciliation Trend</h4>
              <p className="text-xs text-slate-500">
                Audited Top-Line Turnover vs Clean Banking Throughput across FY23-24, FY24-25, and FY25-26
              </p>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-indigo-600 inline-block" />
                <span className="text-slate-600 font-medium">Turnover</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
                <span className="text-slate-600 font-medium">Banking Inflow</span>
              </span>
            </div>
          </div>

          {/* Bar Comparison Chart */}
          <div className="mt-6 space-y-5">
            {/* FY25-26 */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span className="text-slate-700 font-bold">FY 2025-26 (Provisional &amp; Actuals)</span>
                <span className="text-slate-900 font-mono font-bold">
                  ₹ 173.00 Cr GST / ₹ 168.40 Cr Bank (Concordance 0.97x)
                </span>
              </div>
              <div className="space-y-1">
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-indigo-600 h-3 rounded-full" style={{ width: '100%' }} />
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-emerald-500 h-3 rounded-full" style={{ width: '97.3%' }} />
                </div>
              </div>
            </div>

            {/* FY24-25 */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span className="text-slate-700 font-bold">FY 2024-25 (Audited Financials)</span>
                <span className="text-slate-900 font-mono font-bold">
                  ₹ 104.06 Cr GST / ₹ 100.32 Cr Bank (Concordance 0.96x)
                </span>
              </div>
              <div className="space-y-1">
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-indigo-600 h-3 rounded-full" style={{ width: '60.1%' }} />
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-emerald-500 h-3 rounded-full" style={{ width: '57.9%' }} />
                </div>
              </div>
            </div>

            {/* FY23-24 */}
            <div>
              <div className="flex items-center justify-between text-xs font-medium mb-1">
                <span className="text-slate-700 font-bold">FY 2023-24 (Base Year)</span>
                <span className="text-slate-900 font-mono font-bold">
                  ₹ 22.77 Cr GST / ₹ 21.98 Cr Bank (Concordance 0.97x)
                </span>
              </div>
              <div className="space-y-1">
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-indigo-600 h-3 rounded-full" style={{ width: '13.1%' }} />
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                  <div className="bg-emerald-500 h-3 rounded-full" style={{ width: '12.7%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Working Capital Cycle Breakdown */}
          <div className="mt-8 border-t border-slate-100 pt-5">
            <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
              Working Capital Cycle (24.9 Days Net Operating Cycle)
            </h5>
            <div className="grid grid-cols-4 gap-3 text-center text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <span className="text-slate-500 text-[11px] block">Debtor Days (DSO)</span>
                <span className="text-slate-900 font-bold text-sm font-mono mt-0.5 block">31.2 days</span>
                <span className="text-emerald-600 text-[10px] font-medium">B2B Institutional</span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <span className="text-slate-500 text-[11px] block">Stock Days (DIO)</span>
                <span className="text-slate-900 font-bold text-sm font-mono mt-0.5 block">18.2 days</span>
                <span className="text-emerald-600 text-[10px] font-medium">Fast Tanker Churn</span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                <span className="text-slate-500 text-[11px] block">Creditor Days (DPO)</span>
                <span className="text-slate-900 font-bold text-sm font-mono mt-0.5 block">24.5 days</span>
                <span className="text-slate-600 text-[10px] font-medium">Crude Oil LC Terms</span>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2.5">
                <span className="text-indigo-800 text-[11px] block font-semibold">Net WC Cycle</span>
                <span className="text-indigo-900 font-bold text-sm font-mono mt-0.5 block">24.9 days</span>
                <span className="text-indigo-700 text-[10px] font-medium">31.2 + 18.2 - 24.5</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Sanctioned Bank Credit Lines & Covenants */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-slate-900 text-sm">Sanctioned Debt &amp; Credit Limits</h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Consortium Working Capital Limits: ₹ 13.00 Cr
            </p>

            <div className="mt-4 space-y-3">
              {/* YES Bank Facility */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">YES Bank Ltd (Primary)</span>
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    ₹ 8.00 Cr Limit
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Average Outstanding:</span>
                    <strong className="text-slate-900">₹ 6.85 Cr (85.6%)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Facility Type:</span>
                    <span>Working Capital Cash Credit</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pricing / ROI:</span>
                    <span>1-Yr MCLR + 1.20% (9.25%)</span>
                  </div>
                </div>
              </div>

              {/* HDFC Bank Facility */}
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900">HDFC Bank Ltd</span>
                  <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                    ₹ 5.00 Cr Limit
                  </span>
                </div>
                <div className="mt-2 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Average Outstanding:</span>
                    <strong className="text-slate-900">₹ 3.92 Cr (78.4%)</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Facility Type:</span>
                    <span>Working Capital CC</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Primary Charge:</span>
                    <span>Pari-passu on Stocks &amp; Debtors</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bureau & Score Card */}
            <div className="mt-4 bg-slate-900 text-white rounded-lg p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">Commercial CIBIL Rank</span>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold px-2 py-0.5 rounded">
                  CMR-3 / 738
                </span>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Historical Overdues:</span>
                  <span className="text-emerald-400 font-bold">0 DPD (Nil Delinquency)</span>
                </div>
                <div className="flex justify-between">
                  <span>Managing Director Score:</span>
                  <span className="text-slate-200 font-bold">762 (Consumer CIBIL)</span>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => onNavigateTab('financial')}
            className="mt-4 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors text-center"
          >
            View All 25 CDD Ratios &amp; Schedules →
          </button>
        </div>
      </div>

      {/* Credit SWOT Panel (Underwriting View) */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">Automated Credit SWOT &amp; Underwriting Matrix</h4>
              <p className="text-xs text-slate-500">
                Grounded strictly in computed financial ratios, bank reconciliation deltas, and detected anomaly rules.
              </p>
            </div>
          </div>
          <span className="text-xs bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-1 rounded-md border border-indigo-100">
            Rule-Engine Synthesized
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Strengths */}
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-lg p-4">
            <h5 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Strengths</span>
            </h5>
            <ul className="space-y-1.5 text-xs text-emerald-950">
              {swot.strengths.map((s, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-emerald-600 font-bold">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Weaknesses */}
          <div className="bg-amber-50/60 border border-amber-200/80 rounded-lg p-4">
            <h5 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Weaknesses</span>
            </h5>
            <ul className="space-y-1.5 text-xs text-amber-950">
              {swot.weaknesses.map((w, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-amber-600 font-bold">•</span>
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Opportunities */}
          <div className="bg-blue-50/60 border border-blue-200/80 rounded-lg p-4">
            <h5 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Opportunities</span>
            </h5>
            <ul className="space-y-1.5 text-xs text-blue-950">
              {swot.opportunities.map((o, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-blue-600 font-bold">•</span>
                  <span>{o}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Threats */}
          <div className="bg-rose-50/60 border border-rose-200/80 rounded-lg p-4">
            <h5 className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              <span>Threats &amp; Credit Risks</span>
            </h5>
            <ul className="space-y-1.5 text-xs text-rose-950">
              {swot.threats.map((t, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-rose-600 font-bold">•</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Executive Verdict Box */}
        <div className="mt-4 bg-slate-900 rounded-lg p-4 text-white text-xs leading-relaxed">
          <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-400 block mb-1">
            Senior Credit Officer Perspective &amp; Recommendation
          </span>
          <p className="text-slate-200">{swot.executiveVerdict}</p>
        </div>
      </div>
    </div>
  );
};
