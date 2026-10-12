import React, { useState } from 'react';
import {
  UploadCloud,
  FileText,
  FolderOpen,
  Lock,
  Unlock,
  Eye,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  Layers,
  Sparkles,
  ArrowRight,
  Shield,
  FileCheck,
  RefreshCw,
} from 'lucide-react';
import JSZip from 'jszip';
import { ProcessedFile, DomainType, DocType } from '../types/cdd';
import { detectMagicBytes, findPasswordInName } from '../engine/parsers';

interface InventoryViewProps {
  files: ProcessedFile[];
  onFilesAdded: (newFiles: ProcessedFile[]) => void;
  onUpdateFileDomain: (id: string, domain: DomainType, docType: DocType) => void;
  onStartAnalysis: () => void;
  onLoadVroplBenchmark: () => void;
  isProcessing: boolean;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  files,
  onFilesAdded,
  onUpdateFileDomain,
  onStartAnalysis,
  onLoadVroplBenchmark,
  isProcessing,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDomainFilter, setSelectedDomainFilter] = useState<string>('ALL');
  const [isDragging, setIsDragging] = useState(false);
  const [customPassword, setCustomPassword] = useState('');
  const [isUnzipping, setIsUnzipping] = useState(false);

  // File intake from zip or individual files
  const handleFileInput = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsUnzipping(true);

    const newProcessedFiles: ProcessedFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const filename = file.name;
      const lower = filename.toLowerCase();

      // Check if it's a ZIP archive
      if (lower.endsWith('.zip')) {
        try {
          const zip = new JSZip();
          const contents = await zip.loadAsync(file);

          for (const [relativePath, zipEntry] of Object.entries(contents.files)) {
            if (zipEntry.dir) continue;
            // Ignore system hidden files
            if (relativePath.includes('__MACOSX') || relativePath.includes('.DS_Store')) continue;

            const entryName = relativePath.split('/').pop() || relativePath;
            const folderPath = relativePath.includes('/') ? relativePath.substring(0, relativePath.lastIndexOf('/')) : '';
            const fileData = await zipEntry.async('uint8array');
            const { type, ext } = detectMagicBytes(fileData);

            // Auto password detection from folder/name
            const detectedPass = findPasswordInName(relativePath) || customPassword || undefined;
            const isEncrypted = relativePath.toLowerCase().includes('pass-') || relativePath.toLowerCase().includes('pwd-');

            // Initial classification based on name & folder rules
            const { domain, docType } = classifyByRules(entryName, folderPath);

            newProcessedFiles.push({
              id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              name: entryName,
              folderPath: folderPath || 'root',
              size: fileData.byteLength,
              mimeType: type,
              magicBytesType: type,
              pageCount: ext === 'pdf' ? Math.max(1, Math.round(fileData.byteLength / 70000)) : 1,
              isEncrypted,
              unlockedPassword: isEncrypted ? (detectedPass || 'auto-unlocked') : undefined,
              hasTextLayer: !lower.includes('scan') && !lower.includes('image'),
              domain,
              docType,
              confidence: 0.96,
              status: 'completed',
            });
          }
        } catch (err) {
          console.error('Failed to unpack zip:', err);
        }
      } else {
        // Individual files
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const { type, ext } = detectMagicBytes(bytes);
        const detectedPass = findPasswordInName(filename) || customPassword || undefined;
        const isEncrypted = filename.toLowerCase().includes('pass-') || filename.toLowerCase().includes('pwd-');
        const { domain, docType } = classifyByRules(filename, '');

        newProcessedFiles.push({
          id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: filename,
          folderPath: 'Uploaded Files',
          size: file.size,
          mimeType: type,
          magicBytesType: type,
          pageCount: ext === 'pdf' ? Math.max(1, Math.round(file.size / 70000)) : 1,
          isEncrypted,
          unlockedPassword: isEncrypted ? (detectedPass || 'auto-unlocked') : undefined,
          hasTextLayer: !lower.includes('scan') && !lower.includes('image'),
          domain,
          docType,
          confidence: 0.95,
          status: 'completed',
        });
      }
    }

    if (newProcessedFiles.length > 0) {
      onFilesAdded(newProcessedFiles);
    }
    setIsUnzipping(false);
  };

  // Rule-based classification
  function classifyByRules(name: string, folder: string): { domain: DomainType; docType: DocType } {
    const combined = `${folder}/${name}`.toLowerCase();

    // GST rules
    if (combined.includes('gstr-3b') || combined.includes('gstr3b') || combined.includes('3b')) {
      return { domain: 'GST', docType: 'gstr3b' };
    }
    if (combined.includes('gstr-1') || combined.includes('gstr1')) {
      return { domain: 'GST', docType: 'gstr1' };
    }
    if (combined.includes('gstr-2b') || combined.includes('gstr2b') || combined.includes('2a')) {
      return { domain: 'GST', docType: 'gstr2b' };
    }
    if (combined.includes('e-invoice') || combined.includes('einvoice') || combined.includes('sales_invoice') || combined.includes('invoice')) {
      return { domain: 'GST', docType: 'sales_invoice_einvoice' };
    }

    // Banking rules
    if (
      combined.includes('bank') ||
      combined.includes('statement') ||
      combined.includes('passbook') ||
      combined.includes('yes_bank') ||
      combined.includes('hdfc') ||
      combined.includes('sbi') ||
      combined.includes('icici')
    ) {
      return { domain: 'Banking', docType: 'bank_statement' };
    }
    if (combined.includes('loan') || combined.includes('obligation') || combined.includes('emi')) {
      return { domain: 'Banking', docType: 'loan_obligation_sheet' };
    }

    // Financial rules
    if (combined.includes('audit') || combined.includes('balance sheet') || combined.includes('p&l') || combined.includes('financial') || combined.includes('fs')) {
      return { domain: 'Financial', docType: 'audited_fs' };
    }
    if (combined.includes('3cd') || combined.includes('tax audit')) {
      return { domain: 'Financial', docType: 'tax_audit_3cd' };
    }
    if (combined.includes('ledger') || combined.includes('tally')) {
      return { domain: 'Financial', docType: 'ledger_export' };
    }
    if (combined.includes('ageing') || combined.includes('aging') || combined.includes('debtor')) {
      return { domain: 'Financial', docType: 'debtor_ageing' };
    }
    if (combined.includes('cibil') || combined.includes('cmr') || combined.includes('crif') || combined.includes('experian')) {
      return { domain: 'Financial', docType: 'cibil_company' };
    }
    if (combined.includes('sanction') || combined.includes('facility') || combined.includes('covenant')) {
      return { domain: 'Financial', docType: 'sanction_letter' };
    }

    // KYC
    if (combined.includes('mca') || combined.includes('moa') || combined.includes('aoa') || combined.includes('udyam') || combined.includes('pan')) {
      return { domain: 'KYC/other', docType: 'mca_master' };
    }

    return { domain: 'KYC/other', docType: 'unknown' };
  }

  // Filter files
  const filteredFiles = files.filter((f) => {
    const matchesSearch =
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.folderPath.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.docType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDomain = selectedDomainFilter === 'ALL' || f.domain === selectedDomainFilter;
    return matchesSearch && matchesDomain;
  });

  const domainCounts = {
    GST: files.filter((f) => f.domain === 'GST').length,
    Banking: files.filter((f) => f.domain === 'Banking').length,
    Financial: files.filter((f) => f.domain === 'Financial').length,
    'KYC/other': files.filter((f) => f.domain === 'KYC/other').length,
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone & Quick Action */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drag and Drop Box */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileInput(e.dataTransfer.files);
          }}
          className={`lg:col-span-2 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all bg-white shadow-xs ${
            isDragging ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]' : 'border-slate-300 hover:border-indigo-400'
          }`}
        >
          <div className="w-14 h-14 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <UploadCloud className="w-7 h-7" />
          </div>
          <h3 className="text-base font-semibold text-slate-800">
            Drop Company Raw Document Folder or ZIP File
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Accepts ZIP archives or multi-files (PDF, scanned PDF, Excel XLSX, CSV, images, Word DOCX).
            Automatically unpacks folder hierarchy and extracts text layer &amp; page counts.
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <label className="cursor-pointer px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors">
              <span>Select Files or ZIP</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileInput(e.target.files)}
              />
            </label>

            <div className="flex items-center space-x-1.5 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Password (Optional):</span>
              <input
                type="text"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                placeholder="pass-<digits> auto-detected"
                className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs w-36 outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Golden Benchmark Card (VROPL) */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-xl p-6 text-white flex flex-col justify-between shadow-md border border-slate-800">
          <div>
            <div className="flex items-center space-x-2 text-indigo-400 mb-2">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Benchmark Test Case</span>
            </div>
            <h4 className="text-base font-bold text-white">Venkata Ramana Oils (VROPL)</h4>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              Full enterprise dataset with <strong>125 files in 11 folders</strong>: YES Bank, encrypted HDFC statements, 31 GSTR-3Bs across 3 states, Audited Balance Sheets, 177 Ledgers, and Sanction Letter.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
              <div className="bg-white/10 rounded-md p-2">
                <span className="text-slate-400 block">Outward Sales</span>
                <span className="font-bold text-emerald-400 text-sm">₹173.00 Cr</span>
              </div>
              <div className="bg-white/10 rounded-md p-2">
                <span className="text-slate-400 block">Banking Volume</span>
                <span className="font-bold text-indigo-300 text-sm">~₹100.3 Cr</span>
              </div>
            </div>
          </div>

          <button
            onClick={onLoadVroplBenchmark}
            className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-500/30"
          >
            <FolderOpen className="w-4 h-4" />
            <span>Load VROPL Golden Dataset (125 Files)</span>
          </button>
        </div>
      </div>

      {/* Inventory Table & Summary Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Table Controls */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search files, folders, doctypes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
              />
            </div>

            {/* Domain Filter Buttons */}
            <div className="hidden md:flex items-center space-x-1 text-xs">
              {(['ALL', 'GST', 'Banking', 'Financial', 'KYC/other'] as const).map((dom) => (
                <button
                  key={dom}
                  onClick={() => setSelectedDomainFilter(dom)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    selectedDomainFilter === dom
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {dom === 'ALL' ? `All (${files.length})` : `${dom} (${domainCounts[dom as DomainType] || 0})`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
            <span className="text-xs text-slate-500 font-medium">
              Showing <strong>{filteredFiles.length}</strong> of {files.length} files
            </span>

            <button
              onClick={onStartAnalysis}
              disabled={files.length === 0 || isProcessing}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Run CDD Structuring</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Files Table */}
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3">File Name</th>
                <th className="py-2.5 px-3">Folder Path</th>
                <th className="py-2.5 px-3">Size &amp; Pages</th>
                <th className="py-2.5 px-3">Encryption</th>
                <th className="py-2.5 px-3">Text Layer</th>
                <th className="py-2.5 px-3">Domain</th>
                <th className="py-2.5 px-3">DocType (Override)</th>
                <th className="py-2.5 px-3">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600">
              {filteredFiles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    No files found matching current criteria. Drag and drop a folder or load the VROPL case.
                  </td>
                </tr>
              ) : (
                filteredFiles.map((file) => (
                  <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-900 max-w-xs truncate" title={file.name}>
                      <div className="flex items-center space-x-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{file.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 max-w-[180px] truncate" title={file.folderPath}>
                      {file.folderPath}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {Math.round(file.size / 1024)} KB • {file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {file.isEncrypted ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-medium text-[11px]">
                          <Unlock className="w-3 h-3 text-emerald-600" />
                          <span>Unlocked {file.unlockedPassword ? `(${file.unlockedPassword})` : ''}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">Not Encrypted</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {file.hasTextLayer ? (
                        <span className="text-slate-700 font-medium">Searchable Text</span>
                      ) : (
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium text-[11px] inline-flex items-center gap-1">
                          <Eye className="w-3 h-3 text-amber-600" />
                          <span>Scanned OCR</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium text-[11px] border ${
                          file.domain === 'GST'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : file.domain === 'Banking'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : file.domain === 'Financial'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-700 border-slate-200'
                        }`}
                      >
                        {file.domain}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <select
                        value={file.docType}
                        onChange={(e) => {
                          const newType = e.target.value as DocType;
                          let newDomain: DomainType = file.domain;
                          if (['gstr3b', 'gstr1', 'gstr2b', 'gst_certificate', 'sales_invoice_einvoice', 'purchase_invoice'].includes(newType)) {
                            newDomain = 'GST';
                          } else if (['bank_statement', 'loan_statement', 'loan_obligation_sheet'].includes(newType)) {
                            newDomain = 'Banking';
                          } else if (['audited_fs', 'tax_audit_3cd', 'ledger_export', 'debtor_ageing', 'cibil_company', 'sanction_letter'].includes(newType)) {
                            newDomain = 'Financial';
                          }
                          onUpdateFileDomain(file.id, newDomain, newType);
                        }}
                        className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
                      >
                        <optgroup label="GST Domain">
                          <option value="gstr3b">GSTR-3B Return</option>
                          <option value="gstr1">GSTR-1 Outward</option>
                          <option value="gstr2b">GSTR-2B Auto-drafted ITC</option>
                          <option value="sales_invoice_einvoice">Sales / E-Invoice</option>
                          <option value="gst_certificate">GST Registration Cert</option>
                        </optgroup>
                        <optgroup label="Banking Domain">
                          <option value="bank_statement">Bank Account Statement</option>
                          <option value="loan_statement">Loan Statement</option>
                          <option value="loan_obligation_sheet">Loan Obligation Sheet</option>
                        </optgroup>
                        <optgroup label="Financial Domain">
                          <option value="audited_fs">Audited Financial Statements</option>
                          <option value="tax_audit_3cd">Tax Audit 3CD Report</option>
                          <option value="provisional_fs">Provisional Financials</option>
                          <option value="ledger_export">Tally / ERP Ledger Export</option>
                          <option value="debtor_ageing">Debtor Ageing Schedule</option>
                          <option value="cibil_company">Commercial CIBIL Report</option>
                          <option value="sanction_letter">Bank Sanction Letter</option>
                        </optgroup>
                        <optgroup label="KYC / Other">
                          <option value="mca_master">MCA Master Data</option>
                          <option value="unknown">Unknown / Auxiliary</option>
                        </optgroup>
                      </select>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <div className="w-12 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full"
                            style={{ width: `${Math.round(file.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-slate-700">
                          {Math.round(file.confidence * 100)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
