import React from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Cpu, Pause, X } from 'lucide-react';

interface ProcessingProgressModalProps {
  isOpen: boolean;
  progressPercent: number;
  currentStep: string;
  processedCount: number;
  totalCount: number;
  onCancel: () => void;
}

export const ProcessingProgressModal: React.FC<ProcessingProgressModalProps> = ({
  isOpen,
  progressPercent,
  currentStep,
  processedCount,
  totalCount,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 animate-spin">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">CDD Data Structuring in Progress</h3>
              <p className="text-xs text-slate-500">Executing deterministic pipeline &amp; AI extraction</p>
            </div>
          </div>

          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
            title="Cancel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-700">{currentStep}</span>
            <span className="text-indigo-600 font-mono">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-slate-400">
            <span>{processedCount} of {totalCount} files sorted &amp; parsed</span>
            <span>Concurrency: 3 workers</span>
          </div>
        </div>

        {/* Pipeline Stages checklist */}
        <div className="border border-slate-100 rounded-lg p-3 bg-slate-50 text-xs space-y-2 text-slate-600">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-4 h-4 ${progressPercent >= 25 ? 'text-emerald-500' : 'text-slate-300'}`} />
            <span>1. Magic Bytes Inventory &amp; Auto Password Unlocking</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-4 h-4 ${progressPercent >= 50 ? 'text-emerald-500' : 'text-slate-300'}`} />
            <span>2. Classification &amp; Bundled PDF Page Splitting</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-4 h-4 ${progressPercent >= 75 ? 'text-emerald-500' : 'text-slate-300'}`} />
            <span>3. Chunked Banking Delta &amp; GST Return Extractions</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={`w-4 h-4 ${progressPercent >= 100 ? 'text-emerald-500' : 'text-slate-300'}`} />
            <span>4. 25 CDD Ratios &amp; 13 Reconciliations Calculation</span>
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
          >
            Cancel Pipeline
          </button>
        </div>
      </div>
    </div>
  );
};
