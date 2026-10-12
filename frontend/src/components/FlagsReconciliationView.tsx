import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Download,
  Filter,
  Search,
  FileCheck,
  Info,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { CddDataset, SourceRef, ValidationCheckItem, AnomalyFlagItem } from '../types/cdd';
import { buildFlagsWorkbook, downloadWorkbook } from '../engine/excelExporter';

interface FlagsReconciliationViewProps {
  dataset: CddDataset;
  onInspectSource: (source: SourceRef, name: string, val: string) => void;
}

export const FlagsReconciliationView: React.FC<FlagsReconciliationViewProps> = ({
  dataset,
  onInspectSource,
}) => {
  const [activeTab, setActiveTab] = useState<'reconciliations' | 'flags'>('reconciliations');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSeverity, setFilterSeverity] = useState<string>('ALL');

  const { company, validations, flags } = dataset;

  const filteredValidations = validations.filter((v) => {
    return filterStatus === 'ALL' || v.status === filterStatus;
  });

  const filteredFlags = flags.filter((f) => {
    return filterSeverity === 'ALL' || f.severity === filterSeverity;
  });

  const handleExportFlagsExcel = () => {
    const wb = buildFlagsWorkbook(dataset);
    downloadWorkbook(wb, `Flags_and_DataQuality_${company.name}`);
  };

  const passCount = validations.filter((v) => v.status === 'PASS').length;
  const warnCount = validations.filter((v) => v.status === 'WARN').length;
  const failCount = validations.filter((v) => v.status === 'FAIL').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h3 className="font-bold text-slate-900 text-base">Reconciliations &amp; Red Flags Audit Report</h3>
            <span className="bg-amber-100 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-full">
              {validations.length} Reconciliations • {flags.length} Anomaly Flags
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Deterministic cross-domain reconciliation checks (Part B7) and anomaly detection rules (Part B8) with source links.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportFlagsExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Flags_and_DataQuality.xlsx</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-3 border-b border-slate-200 text-xs font-semibold text-slate-600">
        <button
          onClick={() => setActiveTab('reconciliations')}
          className={`pb-2.5 px-3 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'reconciliations'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <span>Reconciliation Checks (Part B7)</span>
          <span className="bg-slate-100 px-2 py-0.5 rounded-full text-[11px] font-mono text-slate-600">
            {passCount} Pass / {warnCount + failCount} Alerts
          </span>
        </button>

        <button
          onClick={() => setActiveTab('flags')}
          className={`pb-2.5 px-3 transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'flags'
              ? 'border-amber-600 text-amber-700'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <span>Anomaly Red Flags (Part B8)</span>
          <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold">
            {flags.length} Detected
          </span>
        </button>
      </div>

      {/* Tab 1: 13 Deterministic Reconciliations */}
      {activeTab === 'reconciliations' && (
        <div className="space-y-4">
          {/* Status filter bar */}
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-medium">Filter by Status:</span>
            {['ALL', 'PASS', 'WARN', 'FAIL'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filterStatus === st
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {st === 'ALL'
                  ? `All (${validations.length})`
                  : st === 'PASS'
                  ? `Pass (${passCount})`
                  : st === 'WARN'
                  ? `Warning (${warnCount})`
                  : `Fail (${failCount})`}
              </button>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Check ID</th>
                    <th className="py-2.5 px-3">Reconciliation Audit Check</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3">Expected vs Actual</th>
                    <th className="py-2.5 px-3">Auditor Evidence &amp; Verification</th>
                    <th className="py-2.5 px-3">Source Ref</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredValidations.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-bold text-slate-500 whitespace-nowrap">{v.id}</td>
                      <td className="py-3 px-3 font-semibold text-slate-900 max-w-xs">
                        <div>{v.name}</div>
                        <div className="text-[10px] text-slate-500 font-normal mt-0.5">{v.description}</div>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                          {v.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border inline-flex items-center gap-1 ${
                            v.status === 'PASS'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : v.status === 'WARN'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {v.status === 'PASS' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                          )}
                          <span>{v.status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs">
                        <div className="text-slate-500">Exp: <span className="font-mono text-slate-800">{v.expected}</span></div>
                        <div className="text-slate-900 font-bold">Act: <span className="font-mono text-slate-900">{v.actual}</span></div>
                        {v.variance && (
                          <div className="text-[10px] text-indigo-700 font-semibold">Variance: {v.variance}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 max-w-sm">
                        {v.evidence}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <button
                          onClick={() => onInspectSource(v.sourceRef, v.name, v.actual)}
                          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>{v.sourceRef.file}</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Anomaly Red Flags */}
      {activeTab === 'flags' && (
        <div className="space-y-4">
          <div className="flex items-center space-x-2 text-xs">
            <span className="text-slate-500 font-medium">Filter Severity:</span>
            {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((sev) => (
              <button
                key={sev}
                onClick={() => setFilterSeverity(sev)}
                className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                  filterSeverity === sev
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filteredFlags.map((flag) => (
              <div
                key={flag.id}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:border-slate-300 transition-all space-y-3"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        flag.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : flag.severity === 'HIGH'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : flag.severity === 'MEDIUM'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}
                    >
                      {flag.severity} RISK
                    </span>
                    <span className="text-xs font-semibold text-slate-500">[{flag.category}]</span>
                    <h4 className="font-bold text-slate-900 text-sm">{flag.title}</h4>
                  </div>

                  <span className="text-xs font-mono font-bold text-slate-400">{flag.id}</span>
                </div>

                <p className="text-xs text-slate-700 leading-relaxed">
                  {flag.plainDescription}
                </p>

                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 text-xs">
                  <span className="text-slate-500 font-semibold block text-[11px] uppercase tracking-wider mb-1">
                    Quantified Supporting Numbers &amp; Evidence:
                  </span>
                  <div className="text-slate-900 font-mono font-medium">
                    {flag.supportingNumbers}
                  </div>
                </div>

                <div className="bg-indigo-50/60 rounded-lg p-3 border border-indigo-100 text-xs text-indigo-950">
                  <span className="text-indigo-800 font-semibold block text-[11px] uppercase tracking-wider mb-0.5">
                    Recommended Underwriting Mitigation / Condition Precedent:
                  </span>
                  <div>{flag.suggestedMitigation}</div>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                  <span>Source Documents Traced:</span>
                  <div className="flex items-center space-x-2">
                    {flag.sourceRefs.map((s, idx) => (
                      <button
                        key={idx}
                        onClick={() => onInspectSource(s, flag.title, flag.supportingNumbers)}
                        className="text-indigo-600 hover:text-indigo-800 font-medium hover:underline inline-flex items-center gap-0.5"
                      >
                        <span>{s.file}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
