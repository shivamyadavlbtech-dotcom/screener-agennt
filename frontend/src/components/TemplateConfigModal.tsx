import React, { useState } from 'react';
import { X, SlidersHorizontal, Check, RefreshCw, Code } from 'lucide-react';
import { CddTemplateConfig, DEFAULT_CDD_TEMPLATE } from '../data/cddTemplateConfig';

interface TemplateConfigModalProps {
  config: CddTemplateConfig;
  onSave: (newConfig: CddTemplateConfig) => void;
  onClose: () => void;
}

export const TemplateConfigModal: React.FC<TemplateConfigModalProps> = ({
  config,
  onSave,
  onClose,
}) => {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(config, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(jsonText);
      onSave(parsed);
      onClose();
    } catch (e: any) {
      setJsonError(e.message || 'Invalid JSON syntax');
    }
  };

  const handleResetDefaults = () => {
    setJsonText(JSON.stringify(DEFAULT_CDD_TEMPLATE, null, 2));
    setJsonError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <SlidersHorizontal className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-semibold text-base">CDD Output Layout &amp; Benchmarks Template</h3>
              <p className="text-xs text-slate-400">Configurable JSON without modifying engine code (Part A4 / D6)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* JSON Editor */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-slate-600 font-medium">
              Edit thresholds, workbook sheet lists, and anomaly rule toggles below:
            </span>
            <button
              onClick={handleResetDefaults}
              className="text-indigo-600 hover:text-indigo-800 font-semibold text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reset to Loanbazaar Default</span>
            </button>
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => {
              setJsonText(e.target.value);
              setJsonError(null);
            }}
            rows={18}
            className="w-full font-mono text-xs p-3 bg-slate-900 text-emerald-400 border border-slate-700 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {jsonError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-mono">
              Error parsing JSON: {jsonError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-700 text-xs font-semibold hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 flex items-center gap-1.5 shadow-xs"
          >
            <Check className="w-4 h-4" />
            <span>Save Template Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
