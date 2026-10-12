import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Archive,
  SlidersHorizontal,
  RefreshCw,
  Building2,
  CheckCircle,
  AlertTriangle,
  ChevronDown,
  Sparkles,
  Layers,
} from 'lucide-react';
import { CddDataset } from '../types/cdd';
import {
  buildGstWorkbook,
  buildBankingWorkbook,
  buildFinancialWorkbook,
  buildFlagsWorkbook,
  downloadWorkbook,
  exportAllAsZip,
} from '../engine/excelExporter';

interface HeaderProps {
  dataset: CddDataset;
  onLoadVroplCase: () => void;
  onOpenTemplateConfig: () => void;
  onReset: () => void;
  isProcessing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  dataset,
  onLoadVroplCase,
  onOpenTemplateConfig,
  onReset,
  isProcessing,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleDownloadAllZip = async () => {
    try {
      setIsExporting(true);
      const zipBlob = await exportAllAsZip(dataset);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CDD_Full_Pack_${dataset.company.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('ZIP export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadSingle = (type: 'gst' | 'banking' | 'financial' | 'flags') => {
    const comp = dataset.company.name;
    if (type === 'gst') {
      const wb = buildGstWorkbook(dataset);
      downloadWorkbook(wb, `GST_${comp}`);
    } else if (type === 'banking') {
      const wb = buildBankingWorkbook(dataset);
      downloadWorkbook(wb, `Banking_${comp}`);
    } else if (type === 'financial') {
      const wb = buildFinancialWorkbook(dataset);
      downloadWorkbook(wb, `Financial_${comp}`);
    } else if (type === 'flags') {
      const wb = buildFlagsWorkbook(dataset);
      downloadWorkbook(wb, `Flags_and_DataQuality_${comp}`);
    }
    setShowExportMenu(false);
  };

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">CDD Engine</span>
                <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2 py-0.5 rounded-full border border-indigo-500/30 font-medium">
                  Due Diligence Structuring
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Automated Raw Folder Ingestion → GST, Banking &amp; Financial Workbooks
              </p>
            </div>
          </div>

          {/* Active Company Pill */}
          <div className="hidden md:flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg px-3.5 py-1.5 space-x-3">
            <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="text-left">
              <div className="text-xs font-semibold text-slate-200 truncate max-w-xs">
                {dataset.company.name}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>PAN: <strong className="text-slate-300">{dataset.company.pan}</strong></span>
                <span>•</span>
                <span>{dataset.files.length} Files Analyzed</span>
                <span>•</span>
                <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                  <CheckCircle className="w-3 h-3" /> Reconciled
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2">
            {/* Quick Load VROPL Golden Case */}
            <button
              onClick={onLoadVroplCase}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-950/80 text-indigo-300 border border-indigo-700/50 hover:bg-indigo-900 transition-colors shadow-xs"
              title="Load full 125-file Venkata Ramana Oils Private Limited benchmark"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>VROPL Golden Case</span>
            </button>

            {/* Template Config */}
            <button
              onClick={onOpenTemplateConfig}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors border border-transparent hover:border-slate-700"
              title="Configure Output Templates & Benchmarks"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            {/* Export Dropdown */}
            <div className="relative">
              <div className="inline-flex rounded-lg shadow-sm">
                <button
                  onClick={handleDownloadAllZip}
                  disabled={isExporting || isProcessing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-l-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 shadow-xs"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>{isExporting ? 'Packaging...' : 'Export All (ZIP)'}</span>
                </button>
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="px-2 py-1.5 rounded-r-lg bg-emerald-700 hover:bg-emerald-600 text-white border-l border-emerald-800 transition-colors"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Export Popover */}
              {showExportMenu && (
                <div
                  className="absolute right-0 mt-2 w-56 rounded-lg bg-slate-900 border border-slate-700 shadow-xl py-1.5 z-50 text-xs text-slate-200"
                  onMouseLeave={() => setShowExportMenu(false)}
                >
                  <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    Individual Workbooks
                  </div>
                  <button
                    onClick={() => handleDownloadSingle('gst')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <span>GST_<span className="font-semibold text-white">Company</span>.xlsx</span>
                    <span className="text-[10px] text-emerald-400">7 Sheets</span>
                  </button>
                  <button
                    onClick={() => handleDownloadSingle('banking')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <span>Banking_<span className="font-semibold text-white">Company</span>.xlsx</span>
                    <span className="text-[10px] text-emerald-400">8 Sheets</span>
                  </button>
                  <button
                    onClick={() => handleDownloadSingle('financial')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <span>Financial_<span className="font-semibold text-white">Company</span>.xlsx</span>
                    <span className="text-[10px] text-emerald-400">9 Sheets</span>
                  </button>
                  <button
                    onClick={() => handleDownloadSingle('flags')}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800 flex items-center justify-between transition-colors"
                  >
                    <span>Flags_DataQuality.xlsx</span>
                    <span className="text-[10px] text-amber-400">4 Sheets</span>
                  </button>

                  <div className="border-t border-slate-800 my-1"></div>
                  <button
                    onClick={handleDownloadAllZip}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800 font-semibold text-emerald-400 flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download All 4 Workbooks + CSVs</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
