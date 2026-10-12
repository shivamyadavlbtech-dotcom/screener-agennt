import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  RefreshCw,
  Copy,
  Check,
  Download,
  Trash2,
  TrendingUp,
  ShieldAlert,
  Coins,
  Users,
  Clock,
  FileSpreadsheet,
  FileText,
  Layers,
  Bot,
  User,
  ExternalLink,
  ChevronRight,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { ScreenerCompanyData } from '../types/screener.ts';
import { apiUrl } from '../utils/apiBase';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ScreenerAIAgentProps {
  company: ScreenerCompanyData;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
  onSelectCompany?: (companyName: string) => void;
  onOpenStatementsDrawer?: () => void;
}

const PLAYBOOK_PROMPTS = [
  {
    icon: TrendingUp,
    label: '360° Health Audit',
    prompt:
      'Perform a 360-degree Financial Health and Valuation Audit. Include: 1) Revenue and net profit growth trends across quarters and 10-year P&L, 2) Profitability margins (Operating OPM % and Net margins), 3) Return on Capital (ROCE & ROE), and 4) Current valuation vs book value, earnings, and historical ranges.',
  },
  {
    icon: Coins,
    label: 'Quarterly Earnings (YoY & QoQ)',
    prompt:
      'Break down the quarterly financial results. Compare Sales, Operating Profit, OPM %, and Net Profit on both a Year-over-Year (YoY) and Quarter-over-Quarter (QoQ) basis. Provide the complete table of all reported quarters and highlight whether margins and volumes are expanding or contracting.',
  },
  {
    icon: ShieldAlert,
    label: 'Debt & Borrowings Forensic',
    prompt:
      'Conduct an exhaustive forensic analysis of the company debt and borrowing profile. Provide the full table of Long-Term vs Short-Term Borrowings and Lease liabilities from the schedules across all reported balance sheet years. Calculate the Debt-to-Equity and Interest Coverage ratio (Operating Profit / Interest).',
  },
  {
    icon: FileSpreadsheet,
    label: 'Cash Flow & Free Cash Flow (FCF)',
    prompt:
      'Analyze the Cash Flow statement. Compare Cash from Operating Activity (CFO) against Net Profit over all reported years to evaluate earnings quality. Calculate the Free Cash Flow (CFO minus Capex/Fixed Asset purchases) year-by-year in a clear table and explain if the business produces true surplus cash.',
  },
  {
    icon: Users,
    label: 'Promoters & Shareholding Trend',
    prompt:
      'Audit the shareholding pattern across all available quarters. Provide the complete breakdown table of Promoters, FIIs, DIIs, and Public shareholding percentages, along with the total number of shareholders. Have promoters pledged shares or altered their stake?',
  },
  {
    icon: Clock,
    label: 'Working Capital & Efficiency',
    prompt:
      'Examine the operational efficiency ratios: Debtor Days, Inventory Days, Days Payable, and Cash Conversion Cycle. Provide the historical table and explain whether working capital requirements are increasing or improving.',
  },
  {
    icon: Layers,
    label: 'Fact-Check Pros & Cons',
    prompt:
      'Fact-check each company strength and concern against the actual financial figures in the balance sheet, P&L, and cash flows. Which strengths are fully backed by data, and which concerns pose real operational risk?',
  },
  {
    icon: FileText,
    label: 'Corporate Filings & Disclosures',
    prompt:
      'Review the latest corporate announcements, annual report filings, and credit rating disclosures. Summarize the major strategic decisions, regulatory updates, and auditor remarks.',
  },
];

const SUGGESTED_QUICK_QUESTIONS = [
  'Show the complete quarterly results table with margins',
  'What are all the borrowings from the balance sheet schedules?',
  'Calculate Free Cash Flow (CFO - Capex) for the last 5 years',
  'Break down the promoter, FII, and DII holding trajectory',
  'Compare valuation and financial metrics with industry peers',
  'What are the working capital days trends over the last 5 years?',
];

export const ScreenerAIAgent: React.FC<ScreenerAIAgentProps> = ({
  company,
  initialPrompt,
  onClearInitialPrompt,
  onSelectCompany,
  onOpenStatementsDrawer,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Initialize chatbot welcome message when company changes
  useEffect(() => {
    const quartersCount =
      company.consolidated?.quarters?.headers?.length ||
      company.standalone?.quarters?.headers?.length ||
      0;

    const pnlYearsCount =
      company.consolidated?.profitAndLoss?.headers?.length ||
      company.standalone?.profitAndLoss?.headers?.length ||
      0;

    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: `### Loan Bazaar AI Research Agent for **${company.name}**

I am grounded in the information on this page for this company:

* **Company Identity**: ${company.name} (${company.symbol || 'BSE: ' + (company.bseCode || 'N/A')})${company.sector ? ` · Sector: ${company.sector}` : ''}${company.cin ? ` · CIN: ${company.cin}` : ''}
* **Fundamental Indicators**: ${company.topRatios.length} key ratios loaded (Market Cap, Price, P/E, ROCE, ROE, Book Value)
* **Financial Context**: ${quartersCount > 0 ? `${quartersCount} reporting quarters` : 'quarterly data'} · ${pnlYearsCount > 0 ? `${pnlYearsCount} years of P&L` : 'annual P&L'} · balance sheet schedules · cash flows · debt details · ${company.documents.announcements.length} disclosures

**Ask me anything about ${company.name}**—from borrowings and growth trends to free cash flow calculations, quarterly tables, and forensic checks. Or click any playbook audit below.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, [company.symbol, company.name]);

  // Handle external initialPrompt if triggered from table header
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim() && !streaming) {
      sendMessage(initialPrompt.trim());
      if (onClearInitialPrompt) onClearInitialPrompt();
    }
  }, [initialPrompt]);

  // Auto-scroll chat smoothly
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const sendMessage = async (userText: string) => {
    if (!userText.trim() || streaming) return;

    // 1. Direct CIN Lookup detection (e.g. L22210MH1995PLC084781)
    const cinMatch = userText.trim().match(/\b([LUlu]\d{5}[A-Za-z]{2}\d{4}[A-Za-z]{3}\d{6})\b/);
    if (cinMatch && cinMatch[1] && onSelectCompany) {
      onSelectCompany(cinMatch[1].toUpperCase());
      return;
    }

    // 2. Direct company switch detection (e.g. "analyze TCS" or "check Reliance")
    const lower = userText.toLowerCase().trim();
    const switchMatch = lower.match(/(?:switch to|analyze|check|lookup|find|show me)\s+([a-z0-9\s&]+)/i);
    if (switchMatch && switchMatch[1] && onSelectCompany) {
      const candidate = switchMatch[1].replace(/(financials|data|table|report|stock|ltd|limited)/gi, '').trim();
      if (candidate.length >= 2 && candidate.toLowerCase() !== company.name.toLowerCase() && candidate.toLowerCase() !== company.symbol?.toLowerCase()) {
        onSelectCompany(candidate);
        return;
      }
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setStreaming(true);

    const assistantMsgId = `assistant-${Date.now()}`;
    const initialAssistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, initialAssistantMsg]);

    const apiMessages = newMessages
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    try {
      // 1. Streaming response via SSE
      const res = await fetch(apiUrl('/api/agent/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          companyData: company,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Streaming failed with HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        const lines = chunkText.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.chunk) {
                accumulated += parsed.chunk;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId ? { ...msg, content: accumulated } : msg
                  )
                );
              } else if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch {
              // Ignore non-JSON stream fragments
            }
          }
        }
      }

      if (!accumulated.trim()) {
        throw new Error('Empty stream response, falling back to unary chat');
      }
    } catch (err: any) {
      console.warn('Streaming error, falling back to unary /api/agent/chat:', err.message);

      try {
        const unaryRes = await fetch(apiUrl('/api/agent/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            companyData: company,
          }),
        });

        const unaryData = await unaryRes.json();
        if (!unaryRes.ok) {
          throw new Error(unaryData.error || 'Failed to fetch answer.');
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: unaryData.answer || 'No response returned.' }
              : msg
          )
        );
      } catch (fallbackErr: any) {
        const message = /PERMISSION_DENIED|unregistered callers|API Key|API consumer identity/i.test(
          fallbackErr.message || ''
        )
          ? 'Your Gemini API key is invalid, expired, or not enabled for the Generative Language API. Create a fresh key in Google AI Studio, enable the Gemini API, paste it into .env.local, and restart the app.'
          : fallbackErr.message || 'Failed to generate a response.';

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: `### Analysis Error\n\nUnable to generate response: ${message}. Please verify the company dataset or try again.`,
                }
              : msg
          )
        );
      }
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClear = () => {
    if (confirm('Clear the current conversation with Loan Bazaar AI?')) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `Conversation reset. Ready to answer anything about **${company.name}**.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  };

  const handleExportTranscript = () => {
    const transcript = messages
      .map(
        (m) =>
          `[${m.timestamp}] ${m.role === 'user' ? 'INVESTOR' : 'LOAN BAZAAR AI AGENT'}:\n${m.content}\n\n---\n`
      )
      .join('\n');

    const blob = new Blob([transcript], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${company.symbol || 'COMPANY'}_Loan_Bazaar_AI_Chat_Transcript.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render high-contrast, large, ultra-clean Light Theme Markdown formatting
  const renderFormattedContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];

    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    const flushTable = () => {
      if (inTable && tableHeaders.length > 0) {
        elements.push(
          <div key={`table-${elements.length}`} className="my-4 overflow-x-auto rounded-xl border border-slate-300 shadow-xs bg-white">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 text-slate-950 font-bold border-b-2 border-slate-300">
                <tr>
                  {tableHeaders.map((th, i) => (
                    <th key={i} className="px-4 py-3 whitespace-nowrap text-slate-950 font-extrabold text-xs sm:text-sm">
                      {th.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {tableRows.map((tr, rIdx) => (
                  <tr key={rIdx} className="hover:bg-indigo-50/50 transition-colors font-mono text-xs sm:text-sm">
                    {tr.map((td, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-4 py-2.5 whitespace-nowrap text-slate-900 font-medium ${
                          cIdx > 0 ? 'text-right' : 'text-left font-sans font-semibold text-slate-950'
                        }`}
                      >
                        {td.trim()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        inTable = false;
        tableHeaders = [];
        tableRows = [];
      }
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Table row detection
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

        if (cells.every((c) => /^[-:]+$/.test(c))) {
          return;
        }

        if (!inTable) {
          inTable = true;
          tableHeaders = cells;
        } else {
          tableRows.push(cells);
        }
        return;
      }

      if (inTable) {
        flushTable();
      }

      // Headers with high contrast and generous spacing
      if (trimmed.startsWith('### ')) {
        elements.push(
          <h4 key={idx} className="text-base font-bold text-slate-950 mt-5 mb-2.5 flex items-center gap-2">
            <span className="w-2 h-4.5 bg-indigo-600 rounded-xs inline-block shrink-0" />
            <span>{trimmed.replace('### ', '')}</span>
          </h4>
        );
        return;
      }
      if (trimmed.startsWith('## ')) {
        elements.push(
          <h3 key={idx} className="text-lg font-bold text-slate-950 mt-6 mb-3 border-b border-slate-200 pb-2 flex items-center gap-2">
            <span className="w-2.5 h-5 bg-indigo-700 rounded-xs inline-block shrink-0" />
            <span>{trimmed.replace('## ', '')}</span>
          </h3>
        );
        return;
      }
      if (trimmed.startsWith('# ')) {
        elements.push(
          <h2 key={idx} className="text-xl font-extrabold text-slate-950 mt-6 mb-3 border-b-2 border-slate-300 pb-2">
            {trimmed.replace('# ', '')}
          </h2>
        );
        return;
      }

      // Bullet points - comfortable 14px size and relaxed line height
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const itemText = trimmed.slice(2);
        elements.push(
          <div key={idx} className="flex items-start gap-3 my-2 text-slate-900 leading-relaxed text-sm">
            <span className="text-indigo-600 font-extrabold mt-1 shrink-0 text-base leading-none">•</span>
            <div dangerouslySetInnerHTML={{ __html: parseInlineStyles(itemText) }} className="flex-1" />
          </div>
        );
        return;
      }

      // Numbered items - comfortable 14px size
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        elements.push(
          <div key={idx} className="flex items-start gap-3 my-2 text-slate-900 leading-relaxed text-sm">
            <span className="font-bold text-indigo-900 shrink-0 text-xs bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded">
              {numMatch[1]}
            </span>
            <div dangerouslySetInnerHTML={{ __html: parseInlineStyles(numMatch[2]) }} className="flex-1" />
          </div>
        );
        return;
      }

      // Spacing
      if (!trimmed) {
        elements.push(<div key={idx} className="h-2.5" />);
        return;
      }

      // Normal paragraph - 14px text-sm with deep slate-900 contrast
      elements.push(
        <p
          key={idx}
          className="text-sm text-slate-900 leading-relaxed my-2 font-normal"
          dangerouslySetInnerHTML={{ __html: parseInlineStyles(trimmed) }}
        />
      );
    });

    if (inTable) {
      flushTable();
    }

    return elements;
  };

  const parseInlineStyles = (text: string) => {
    return text
      // Bold - deep contrast
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-950">$1</strong>')
      // Hyperlinks: make raw PDF/website URLs clickable without trailing punctuation in the href
      .replace(
        /(https?:\/\/[^\s<>\"'\)\]\}]+?)(?=[\).,;:!?]*(?:\s|$))/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-indigo-700 underline decoration-indigo-500 underline-offset-2 hover:text-indigo-900">$1</a>'
      )
      // Citations
      .replace(
        /\[(.*?)\]/g,
        '<span class="inline-flex items-center px-2 py-0.5 mx-0.5 rounded text-xs font-mono font-semibold bg-indigo-50 text-indigo-950 border border-indigo-200">$1</span>'
      )
      // Currency values
      .replace(
        /(₹\s*[\d,.]+(?:\s*(?:Cr\.|Lakhs|%))?)/g,
        '<span class="font-mono font-extrabold text-emerald-950 bg-emerald-100/90 px-2 py-0.5 rounded border border-emerald-300 text-xs sm:text-sm">$1</span>'
      )
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-slate-950 px-2 py-0.5 rounded text-xs font-mono font-semibold border border-slate-300">$1</code>');
  };

  return (
    <div className="flex-1 flex flex-col w-full bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
      {/* 1. Clean Company Snapshot Banner */}
      <div className="px-6 py-4.5 bg-white border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950 tracking-tight">
              {company.name}
            </h2>
            <span className="text-xs font-bold font-mono text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200">
              {company.symbol}
            </span>
            {company.cin && (
              <span className="text-xs font-mono font-semibold text-slate-600">
                CIN: {company.cin}
              </span>
            )}
            {company.sector && (
              <span className="text-xs font-medium text-slate-500">
                · {company.sector}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap font-medium">
            {company.website && (
              <a href={company.website} target="_blank" rel="noreferrer" className="hover:text-indigo-600 flex items-center gap-1">
                Website <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}
            {company.bseUrl && (
              <a href={company.bseUrl} target="_blank" rel="noreferrer" className="hover:text-indigo-600 flex items-center gap-1">
                BSE ({company.bseCode || 'Link'}) <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}
            {company.nseUrl && (
              <a href={company.nseUrl} target="_blank" rel="noreferrer" className="hover:text-indigo-600 flex items-center gap-1">
                NSE ({company.nseCode || company.symbol}) <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}
          </div>
        </div>

        {/* Key Ratios Strip */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
          {company.topRatios.slice(0, 5).map((ratio, i) => (
            <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shrink-0 text-center min-w-[85px]">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{ratio.name}</p>
              <p className="text-xs sm:text-sm font-extrabold text-slate-950 font-mono mt-0.5">{ratio.value}</p>
            </div>
          ))}
          {onOpenStatementsDrawer && (
            <button
              onClick={onOpenStatementsDrawer}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 shrink-0"
              title="Open full interactive financial statements and schedules"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-700" />
              <span>Full Data Tables</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Interactive Playbook Prompt Carousel */}
      <div className="bg-slate-50/80 border-b border-slate-200 px-6 py-2.5 overflow-x-auto flex items-center gap-2 no-scrollbar shrink-0">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide shrink-0 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
          Playbooks:
        </span>
        {PLAYBOOK_PROMPTS.map((item, idx) => {
          const Icon = item.icon;
          return (
            <button
              key={idx}
              onClick={() => sendMessage(item.prompt)}
              disabled={streaming}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-800 hover:text-indigo-950 rounded-xl text-xs font-semibold shrink-0 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Icon className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Messages Feed */}
      <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 bg-slate-50/30">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-4 max-w-4xl ${
                isUser ? 'ml-auto flex-row-reverse' : 'mr-auto w-full'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm shadow-xs ${
                  isUser
                    ? 'bg-indigo-100 text-indigo-800 border border-indigo-300 font-bold'
                    : 'bg-indigo-600 text-white shadow-xs'
                }`}
              >
                {isUser ? <User className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
              </div>

              {/* Message Bubble */}
              <div
                className={`rounded-2xl p-5 sm:p-6 transition-all shadow-xs relative group ${
                  isUser
                    ? 'bg-indigo-50 border border-indigo-200 text-slate-950 rounded-tr-xs max-w-xl font-medium'
                    : 'bg-white border border-slate-200 text-slate-900 rounded-tl-xs flex-1 shadow-2xs'
                }`}
              >
                {/* Meta header */}
                <div
                  className={`flex items-center justify-between text-xs mb-3 pb-2.5 border-b ${
                    isUser
                      ? 'border-indigo-200 text-indigo-950 font-bold'
                      : 'border-slate-100 text-slate-500 font-medium'
                  }`}
                >
                  <span className={isUser ? 'text-indigo-950 font-bold' : 'text-slate-950 font-bold text-sm'}>
                    {isUser ? 'You (Investor)' : 'Loan Bazaar AI Analyst'}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 font-mono">{msg.timestamp}</span>
                    {!isUser && (
                      <button
                        onClick={() => handleCopy(msg.id, msg.content)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-950 border border-transparent hover:border-slate-200"
                        title="Copy Response"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-4 h-4 text-emerald-700" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="leading-relaxed">
                  {isUser ? (
                    <p className="whitespace-pre-wrap text-slate-950 text-sm font-semibold leading-relaxed">
                      {msg.content}
                    </p>
                  ) : msg.content ? (
                    renderFormattedContent(msg.content)
                  ) : (
                    <div className="flex items-center gap-2.5 text-indigo-700 py-3">
                      <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
                      <span className="font-semibold text-sm text-slate-800">
                        Analyzing {company.name} financial tables, schedules &amp; filings...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. Chat Input & Quick Suggestions Bar */}
      <div className="p-5 sm:p-6 bg-white border-t border-slate-200 rounded-b-2xl shrink-0 space-y-3">
        {/* Quick Question Chips */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          <span className="text-xs font-bold text-slate-600 shrink-0">Ask:</span>
          {SUGGESTED_QUICK_QUESTIONS.map((q, i) => (
            <button
              key={i}
              onClick={() => sendMessage(q)}
              disabled={streaming}
              className="text-xs font-medium text-slate-800 hover:text-indigo-950 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Textarea and Send Button */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-end gap-3"
        >
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask Loan Bazaar AI any question about ${company.name} or type a new company name / 21-digit CIN...`}
              className="w-full bg-slate-50 border border-slate-300 hover:border-slate-400 focus:border-indigo-600 focus:bg-white focus:ring-4 focus:ring-indigo-100 rounded-xl px-4 py-3.5 text-sm text-slate-950 placeholder-slate-400 focus:outline-none resize-none transition-colors leading-relaxed shadow-xs"
            />
            <div className="absolute right-3.5 bottom-2.5 text-xs text-slate-500 font-medium">
              Enter ↵ to send · Shift+Enter for newline
            </div>
          </div>

          <button
            type="submit"
            disabled={!input.trim() || streaming}
            className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-xs transition-colors flex items-center gap-2.5 h-[58px] shrink-0"
          >
            {streaming ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span className="hidden sm:inline">Ask Agent</span>
          </button>
        </form>
      </div>
    </div>
  );
};
