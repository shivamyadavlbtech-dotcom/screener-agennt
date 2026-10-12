import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  RefreshCw,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  FileCode,
  ExternalLink,
  Bot,
  User,
  Plus,
  ArrowUp,
  Sparkles,
  TrendingUp,
  Coins,
  ShieldAlert,
  Users,
  Clock,
  Layers,
  X,
  ChevronRight,
} from 'lucide-react';
import {
  CompanyLookupFailure,
  RegistryInfo,
  ScreenerCandidate,
  ScreenerCompanyData,
  TableData,
} from './types/screener.ts';
import { NOT_AVAILABLE, buildCompanyHeaderLine, parseCin } from './utils/companyHeader.ts';
import { exportCompanyToExcel, exportCompanyToJson } from './utils/excelExport.ts';
import { apiUrl } from './utils/apiBase';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  companyCard?: ScreenerCompanyData;
  playbookChips?: boolean;
  isError?: boolean;
  // Screener matches the user must choose between for a resolved CIN
  candidates?: ScreenerCandidate[];
  candidateCin?: string;
}

// MCA details shown when a CIN resolves but there is no Screener.in dossier to load
const formatRegistryDetails = (registry?: RegistryInfo, cin?: string): string =>
  [
    `- **Company**: ${registry?.name || NOT_AVAILABLE}`,
    `- **CIN**: ${registry?.cin || cin || NOT_AVAILABLE}`,
    `- **State**: ${registry?.state || NOT_AVAILABLE}`,
    `- **Incorporation year**: ${registry?.incorporationYear || NOT_AVAILABLE}`,
    `- **Company status**: ${registry?.companyStatus || NOT_AVAILABLE}`,
    `- **Source**: ${registry?.source || NOT_AVAILABLE}`,
  ].join('\n');

const describeLookupFailure = (failure: CompanyLookupFailure, target: string): string => {
  const cin = failure.cin || parseCin(target) || undefined;
  const name = failure.registry?.name || NOT_AVAILABLE;

  switch (failure.code) {
    case 'UNLISTED':
      return `This is an unlisted company, so it is not in the current company list.\n\n${formatRegistryDetails(failure.registry, cin)}`;
    case 'NOT_ON_SCREENER':
      return `**${name}** is a listed company, but it was not found in the available company data. It may be delisted or suspended.\n\n${formatRegistryDetails(failure.registry, cin)}`;
    case 'MULTIPLE_MATCHES':
      return `CIN ${cin} resolved to **${name}**, but I could not narrow the company down to a single exact match. Please pick the correct company:`;
    case 'CIN_UNRESOLVED':
      return `CIN ${cin} could not be resolved from MCA or the other sources. Please tell me the company name so I can look it up.`;
    default:
      // A CIN that hit a network or page error is never a spelling problem
      return cin
        ? `CIN ${cin} could not be loaded: ${failure.error}`
        : `I couldn't find a listed company matching "**${target}**" in the available company data. Please check the spelling, or try searching by BSE/NSE code (e.g. 532540) or 21-digit CIN (e.g. L22210MH1995PLC084781).`;
  }
};

const extractComparisonQueries = (text: string): string[] | null => {
  const compareRequest = text.trim().match(
    /^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:compare|benchmark)\s+(?:(?:the\s+)?(?:financials|companies|stocks|performance|metrics)(?:\s+of)?\s+)?(.+?)[?.!]*$/i
  );
  if (!compareRequest?.[1]) return null;

  const companyNames = compareRequest[1]
    .replace(/^between\s+/i, '')
    .replace(/\s+(?:on|for|using|based on)\s+.+$/i, '')
    .split(/\s+(?:vs\.?|versus|with|against|and)\s+|,\s*/i);

  const cleanName = (name: string) =>
    name
      .trim()
      .replace(/^and\s+/i, '')
      .replace(/^(?:the\s+)?(?:company|stock)\s+/i, '')
      .replace(/\s+(?:financials|company|stock|data|performance|metrics)$/i, '')
      .trim();

  const cleanedNames = companyNames.map(cleanName);
  const distinctNames = [...new Set(cleanedNames.map((name) => name.toLowerCase()))];
  if (
    cleanedNames.length < 2 ||
    cleanedNames.length > 4 ||
    cleanedNames.some((name) => !name) ||
    distinctNames.length !== cleanedNames.length
  ) {
    return null;
  }
  return cleanedNames;
};

const PLAYBOOK_OPTIONS = [
  {
    id: 'health',
    label: '360° Health Audit',
    prompt:
      'Perform a 360-degree Financial Health and Valuation Audit. Include: 1) Revenue and net profit growth trends across quarters and 10-year P&L, 2) Profitability margins (Operating OPM % and Net margins), 3) Return on Capital (ROCE & ROE), and 4) Current valuation vs book value, earnings, and historical ranges.',
  },
  {
    id: 'quarters',
    label: 'Quarterly Earnings',
    prompt:
      'Break down the quarterly financial results. Compare Sales, Operating Profit, OPM %, and Net Profit on both a Year-over-Year (YoY) and Quarter-over-Quarter (QoQ) basis. Provide the complete table of all reported quarters and highlight whether margins and volumes are expanding or contracting.',
  },
  {
    id: 'debt',
    label: 'Debt & Borrowings Forensic',
    prompt:
      'Conduct an exhaustive forensic analysis of the company debt and borrowing profile. Provide the full table of Long-Term vs Short-Term Borrowings and Lease liabilities from the schedules across all reported balance sheet years. Calculate the Debt-to-Equity and Interest Coverage ratio (Operating Profit / Interest).',
  },
  {
    id: 'fcf',
    label: 'Cash Flow & FCF',
    prompt:
      'Analyze the Cash Flow statement. Compare Cash from Operating Activity (CFO) against Net Profit over all reported years to evaluate earnings quality. Calculate the Free Cash Flow (CFO minus Capex/Fixed Asset purchases) year-by-year in a clear table and explain if the business produces true surplus cash.',
  },
  {
    id: 'shareholding',
    label: 'Promoters & Shareholding Trend',
    prompt:
      'Audit the shareholding pattern across all available quarters. Provide the complete breakdown table of Promoters, FIIs, DIIs, and Public shareholding percentages, along with the total number of shareholders. Have promoters pledged shares or altered their stake?',
  },
];

const WELCOME_SUGGESTION_CHIPS = [
  { label: 'TCS', query: 'TCS' },
  { label: 'Reliance', query: 'Reliance' },
  { label: 'Infosys', query: 'Infosys' },
  { label: 'Tata Motors', query: 'Tata Motors' },
  { label: 'CIN Example', query: 'L22210MH1995PLC084781' },
];

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeCompany, setActiveCompany] = useState<ScreenerCompanyData | null>(null);
  const [chatContextCompanies, setChatContextCompanies] = useState<ScreenerCompanyData[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Slide-over drawer state for full financial tables
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<
    'quarters' | 'profitAndLoss' | 'balanceSheet' | 'cashFlow' | 'ratios' | 'shareholding' | 'peers' | 'documents'
  >('quarters');
  const [viewMode, setViewMode] = useState<'consolidated' | 'standalone'>('consolidated');
  const [shpPeriod, setShpPeriod] = useState<'quarterly' | 'yearly'>('quarterly');
  const [activeDocTab, setActiveDocTab] = useState<'announcements' | 'annualReports' | 'concalls' | 'creditRatings'>('announcements');
  const [expandedSubRows, setExpandedSubRows] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to newest message smoothly
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Adjust textarea height up to 5 lines (~120px)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 130)}px`;
    }
  }, [input]);

  const toggleSubRow = (key: string) => {
    setExpandedSubRows((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const toggleAllSubRowsInTable = (table: TableData, expand: boolean) => {
    const next: Record<string, boolean> = { ...expandedSubRows };
    table.rows.forEach((r, idx) => {
      if (r.subRows && r.subRows.length > 0) {
        next[`${table.title || 'tab'}-${idx}-${r.label}`] = expand;
      }
    });
    setExpandedSubRows(next);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleNewChat = () => {
    setMessages([]);
    setActiveCompany(null);
    setChatContextCompanies([]);
    setInput('');
    setIsDrawerOpen(false);
  };

  // Helper: detect if a user prompt is asking to search or switch to another company
  const isNewCompanyQuery = (text: string, currentCompany: ScreenerCompanyData | null): boolean => {
    if (!currentCompany) return true;

    const clean = text.trim();
    // 21-character CIN (spaces ignored, case-insensitive)
    if (parseCin(clean)) return true;

    // Command patterns like "check TCS", "analyze Reliance", "switch to Infosys"
    if (/^(?:check|analyze|switch to|search|lookup|find|show me|inspect)\s+([A-Za-z0-9\s&.,]+)$/i.test(clean)) {
      return true;
    }

    // Direct company name match from popular tickers
    const popularTickers = ['tcs', 'reliance', 'infosys', 'tata motors', 'mrf', 'wipro', 'hcl', 'itc', 'hdfc'];
    if (popularTickers.includes(clean.toLowerCase())) return true;

    // Numeric BSE code (5 to 6 digits)
    if (/^\d{5,6}$/.test(clean)) return true;

    return false;
  };

  const extractCompanyQuery = (text: string): string => {
    const clean = text.trim();
    const match = clean.match(/^(?:check|analyze|switch to|search|lookup|find|show me|inspect)\s+([A-Za-z0-9\s&.,]+)$/i);
    if (match && match[1]) {
      return match[1].replace(/(?:financials|data|table|report|stock|ltd|limited)$/i, '').trim();
    }
    return clean;
  };

  // Send message flow
  // confirmedCin: set when the user picks one of several Screener matches for a resolved CIN
  const handleSendMessage = async (textToSend: string, confirmedCin?: string) => {
    const userText = textToSend.trim();
    if (!userText || loading) return;

    // 1. Append user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setLoading(true);

    const comparisonQueries = confirmedCin ? null : extractComparisonQueries(userText);
    if (comparisonQueries) {
      try {
        const companyData = await Promise.all(
          comparisonQueries.map(async (query) => {
            const response = await fetch(apiUrl(`/api/company?q=${encodeURIComponent(query)}`));
            const data = await response.json();
            if (!response.ok) {
              throw new Error(data.error || `Could not load ${query} (HTTP ${response.status}).`);
            }
            return data as ScreenerCompanyData;
          })
        );

        setChatContextCompanies(companyData);
        setActiveCompany(companyData[0]);
        if (companyData[0].consolidated?.available) {
          setViewMode('consolidated');
        } else if (companyData[0].standalone?.available) {
          setViewMode('standalone');
        }

        const assistantMsgId = `asst-${Date.now()}`;
        setMessages((prev) => [
          ...prev,
          {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            companyCard: companyData[0],
          },
        ]);

        try {
          const response = await fetch(apiUrl('/api/agent/chat'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages: [{ role: 'user', content: userText }],
              companyData,
            }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || `Analysis failed (HTTP ${response.status}).`);
          }
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantMsgId
                ? { ...message, content: result.answer || 'No response returned.' }
                : message
            )
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown analysis error.';
          setMessages((prev) =>
            prev.map((item) =>
              item.id === assistantMsgId
                ? {
                    ...item,
                    content: `### Analysis Error\n\nUnable to compare the loaded companies: ${message}. Please try again.`,
                    isError: true,
                  }
                : item
            )
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown company lookup error.';
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `### Comparison could not be loaded\n\n${message} Please check both company names or use their company names / stock symbols.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isError: true,
          },
        ]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // 2. Check if this is a company search/switch
    if (confirmedCin || isNewCompanyQuery(userText, activeCompany)) {
      const companySearchTarget = confirmedCin ? userText : extractCompanyQuery(userText);
      let failure: CompanyLookupFailure | null = null;
      try {
        const res = await fetch(
          apiUrl(`/api/company?q=${encodeURIComponent(companySearchTarget)}${
            confirmedCin ? `&cin=${encodeURIComponent(confirmedCin)}` : ''
          }`));
        const data = await res.json();

        if (!res.ok) {
          failure = data;
          throw new Error(data.error || `HTTP error ${res.status}`);
        }

        setActiveCompany(data);
        setChatContextCompanies([data]);
        if (data.consolidated?.available) {
          setViewMode('consolidated');
        } else if (data.standalone?.available) {
          setViewMode('standalone');
        }

        const quartersCount =
          data.consolidated?.quarters?.headers?.length ||
          data.standalone?.quarters?.headers?.length ||
          0;
        const pnlYearsCount =
          data.consolidated?.profitAndLoss?.headers?.length ||
          data.standalone?.profitAndLoss?.headers?.length ||
          0;

        const introText = `${buildCompanyHeaderLine(data)}\n\nI am grounded in the information on this page for this company (${quartersCount > 0 ? `${quartersCount} reporting quarters` : 'quarterly filings'} · ${pnlYearsCount > 0 ? `${pnlYearsCount} years of P&L` : 'annual P&L'} · balance sheet schedules · cash flows · debt details · ${data.documents?.announcements?.length || 0} disclosures).\n\nAsk me any financial question, or choose an audit playbook below:`;

        const assistantMsg: ChatMessage = {
          id: `asst-${Date.now()}`,
          role: 'assistant',
          content: introText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          companyCard: data,
          playbookChips: true,
        };

        setMessages((prev) => [...prev, assistantMsg]);
      } catch (err: any) {
        console.warn('Company fetch error:', err.message);
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: describeLookupFailure(failure || { error: err.message }, companySearchTarget),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isError: true,
          candidates: failure?.code === 'MULTIPLE_MATCHES' ? failure.candidates : undefined,
          candidateCin: failure?.cin,
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setLoading(false);
      }
      return;
    }

    // 3. Otherwise, it is a follow-up question on activeCompany
    if (!activeCompany) {
      setLoading(false);
      return;
    }

    const assistantMsgId = `asst-${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, initialAssistantMsg]);

    const apiMessages = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const res = await fetch(apiUrl('/api/agent/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          companyData: chatContextCompanies.length > 1 ? chatContextCompanies : activeCompany,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Streaming failed with HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let pendingEvent = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        pendingEvent += decoder.decode(value, { stream: true });
        const events = pendingEvent.split(/\r?\n\r?\n/);
        pendingEvent = events.pop() || '';

        for (const event of events) {
          const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;

          const dataStr = dataLine.slice(6).trim();
          if (dataStr === '[DONE]') continue;
          let parsed: { chunk?: string; error?: string };
          try {
            parsed = JSON.parse(dataStr);
          } catch (error) {
            throw new Error(`Invalid response from the AI stream: ${String(error)}`);
          }
          if (parsed.error) throw new Error(parsed.error);
          if (parsed.chunk) {
            accumulated += parsed.chunk;
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, content: accumulated } : m))
            );
          }
        }
      }
      pendingEvent += decoder.decode();
      if (pendingEvent.trim()) {
        const dataLine = pendingEvent.split(/\r?\n/).find((line) => line.startsWith('data: '));
        if (dataLine) {
          const dataStr = dataLine.slice(6).trim();
          if (dataStr !== '[DONE]') {
            const parsed: { chunk?: string; error?: string } = JSON.parse(dataStr);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.chunk) {
              accumulated += parsed.chunk;
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, content: accumulated } : m))
              );
            }
          }
        }
      }

      if (!accumulated.trim()) {
        throw new Error('Empty stream response, falling back to unary chat');
      }
    } catch (streamErr: any) {
      console.warn('Falling back to /api/agent/chat:', streamErr.message);

      try {
        const unaryRes = await fetch(apiUrl('/api/agent/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMessages,
            companyData: chatContextCompanies.length > 1 ? chatContextCompanies : activeCompany,
          }),
        });

        const unaryData = await unaryRes.json();
        if (!unaryRes.ok) {
          throw new Error(unaryData.error || 'Failed to fetch answer.');
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: unaryData.answer || 'No response returned.' }
              : m
          )
        );
      } catch (fallbackErr: any) {
        const message = /PERMISSION_DENIED|unregistered callers|API Key|API consumer identity/i.test(
          fallbackErr.message || ''
        )
          ? 'Your Gemini API key is invalid, expired, or not enabled for the Generative Language API. Create a fresh key in Google AI Studio, enable the Gemini API, paste it into .env.local, and restart the app.'
          : fallbackErr.message || 'Failed to generate a response.';

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: `### Analysis Error\n\nUnable to generate response: ${message}. Please try again.`,
                  isError: true,
                }
              : m
          )
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  const parseInlineStyles = (text: string) => {
    return text
      // Bold: handles **bold** properly without leaving raw asterisks
      .replace(/\*\*([\s\S]+?)\*\*/g, '<strong class="font-bold text-slate-950">$1</strong>')
      // Italic: *italic*
      .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em class="italic text-slate-800">$1</em>')
      // Hyperlinks: make raw PDF/website URLs clickable without trailing punctuation in the href
      .replace(
        /(https?:\/\/[^\s<>\"'\)\]\}]+?)(?=[\).,;:!?]*(?:\s|$))/gi,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-indigo-700 underline decoration-indigo-500 underline-offset-2 hover:text-indigo-900">$1</a>'
      )
      // Citations [Source]
      .replace(
        /\[(.*?)\]/g,
        '<span class="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-xs font-mono font-bold bg-indigo-50 text-indigo-950 border border-indigo-200">$1</span>'
      )
      // Currency values
      .replace(
        /(₹\s*[\d,.]+(?:\s*(?:Cr\.|Lakhs|%))?)/g,
        '<span class="font-mono font-bold text-emerald-950 bg-emerald-100/90 px-1.5 py-0.5 rounded border border-emerald-300 text-xs sm:text-sm">$1</span>'
      )
      // Inline code
      .replace(
        /`([^`]+)`/g,
        '<code class="bg-slate-100 text-slate-950 px-1.5 py-0.5 rounded text-xs font-mono font-semibold border border-slate-300">$1</code>'
      );
  };

  // Robust Markdown formatting for assistant replies
  const renderFormattedMarkdown = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];

    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    const flushTable = () => {
      if (inTable && tableHeaders.length > 0) {
        elements.push(
          <div
            key={`table-${elements.length}`}
            className="my-4 overflow-x-auto rounded-xl border border-slate-300 shadow-xs bg-white"
          >
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead className="bg-slate-100 text-slate-950 font-bold border-b-2 border-slate-300">
                <tr>
                  {tableHeaders.map((th, i) => (
                    <th
                      key={i}
                      className="px-4 py-2.5 whitespace-nowrap text-slate-950 font-extrabold text-xs sm:text-sm"
                      dangerouslySetInnerHTML={{ __html: parseInlineStyles(th.trim()) }}
                    />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {tableRows.map((tr, rIdx) => (
                  <tr key={rIdx} className="hover:bg-indigo-50/40 transition-colors font-mono text-xs sm:text-sm">
                    {tr.map((td, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-4 py-2 whitespace-nowrap text-slate-900 font-medium ${
                          cIdx > 0 ? 'text-right' : 'text-left font-sans font-semibold text-slate-950'
                        }`}
                        dangerouslySetInnerHTML={{ __html: parseInlineStyles(td.trim()) }}
                      />
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

      // Markdown Table detection
      if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
        const cells = trimmed
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

        // Skip divider row e.g. |---|---|
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

      // Headings (with parseInlineStyles applied so **bold** never displays as raw **)
      if (trimmed.startsWith('#### ')) {
        const text = trimmed.slice(5);
        elements.push(
          <h5
            key={idx}
            className="text-sm font-bold text-slate-950 mt-3.5 mb-1.5"
            dangerouslySetInnerHTML={{ __html: parseInlineStyles(text) }}
          />
        );
        return;
      }

      if (trimmed.startsWith('### ')) {
        const text = trimmed.slice(4);
        elements.push(
          <h4
            key={idx}
            className="text-base font-bold text-slate-950 mt-4 mb-2 flex items-center gap-2"
          >
            <span className="w-2 h-4 bg-indigo-600 rounded-xs inline-block shrink-0" />
            <span dangerouslySetInnerHTML={{ __html: parseInlineStyles(text) }} />
          </h4>
        );
        return;
      }

      if (trimmed.startsWith('## ')) {
        const text = trimmed.slice(3);
        elements.push(
          <h3
            key={idx}
            className="text-lg font-bold text-slate-950 mt-5 mb-2.5 border-b border-slate-200 pb-1.5 flex items-center gap-2"
          >
            <span className="w-2.5 h-4.5 bg-indigo-700 rounded-xs inline-block shrink-0" />
            <span dangerouslySetInnerHTML={{ __html: parseInlineStyles(text) }} />
          </h3>
        );
        return;
      }

      if (trimmed.startsWith('# ')) {
        const text = trimmed.slice(2);
        elements.push(
          <h2
            key={idx}
            className="text-xl font-extrabold text-slate-950 mt-5 mb-2.5 border-b-2 border-slate-300 pb-2"
            dangerouslySetInnerHTML={{ __html: parseInlineStyles(text) }}
          />
        );
        return;
      }

      // Bullet points
      if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
        const itemText = trimmed.slice(2);
        elements.push(
          <div key={idx} className="flex items-start gap-2.5 my-2 text-slate-900 leading-relaxed text-sm">
            <span className="text-indigo-600 font-extrabold mt-1 shrink-0 text-base leading-none">•</span>
            <div dangerouslySetInnerHTML={{ __html: parseInlineStyles(itemText) }} className="flex-1" />
          </div>
        );
        return;
      }

      // Numbered items
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        elements.push(
          <div key={idx} className="flex items-start gap-2.5 my-2 text-slate-900 leading-relaxed text-sm">
            <span className="font-bold text-indigo-900 shrink-0 text-xs bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded">
              {numMatch[1]}
            </span>
            <div dangerouslySetInnerHTML={{ __html: parseInlineStyles(numMatch[2]) }} className="flex-1" />
          </div>
        );
        return;
      }

      // Empty line / Spacing
      if (!trimmed) {
        elements.push(<div key={idx} className="h-2" />);
        return;
      }

      // Normal paragraph
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

  const activeFinancials = activeCompany
    ? viewMode === 'consolidated' && activeCompany.consolidated?.available
      ? activeCompany.consolidated
      : activeCompany.standalone?.available
      ? activeCompany.standalone
      : activeCompany.consolidated
    : null;

  const hasBothViews = Boolean(activeCompany?.consolidated?.available && activeCompany?.standalone?.available);

  // Render table for Slide-Over Drawer
  const renderGenericTable = (table?: TableData, emptyMessage = 'No data available') => {
    if (!table || !table.rows || table.rows.length === 0) {
      return (
        <div className="py-8 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
          {emptyMessage}
        </div>
      );
    }

    const tableId = table.title || 'table';
    const totalSubRowsCount = table.rows.reduce(
      (acc, r) => acc + (r.subRows && r.subRows.length > 0 ? r.subRows.length : 0),
      0
    );

    return (
      <div className="space-y-2">
        {totalSubRowsCount > 0 && (
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <span className="font-semibold text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              {totalSubRowsCount} granular schedule rows available
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleAllSubRowsInTable(table, true)}
                className="text-slate-700 hover:text-slate-950 font-bold hover:underline"
              >
                + Expand All Schedules
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={() => toggleAllSubRowsInTable(table, false)}
                className="text-slate-700 hover:text-slate-950 font-bold hover:underline"
              >
                − Collapse All
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto border border-slate-300 rounded-xl bg-white shadow-xs">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-300 text-slate-950 font-extrabold">
                <th className="py-3 px-3.5 min-w-[220px] sticky left-0 bg-slate-100 z-10 border-r border-slate-300 text-slate-950 font-extrabold">
                  {table.headers[0] || 'Metric'}
                </th>
                {table.headers.slice(1).map((h, i) => (
                  <th key={i} className="py-3 px-3.5 text-right whitespace-nowrap min-w-[95px] text-slate-950 font-extrabold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {table.rows.map((row, rIdx) => {
                const rowKey = `${tableId}-${rIdx}-${row.label}`;
                const hasSubs = Boolean(row.subRows && row.subRows.length > 0);
                const isExpanded = Boolean(expandedSubRows[rowKey]);

                return (
                  <React.Fragment key={rIdx}>
                    <tr
                      className={`hover:bg-indigo-50/40 transition-colors ${
                        row.isHighlight ? 'font-bold bg-slate-50 text-slate-950' : 'text-slate-900 font-medium'
                      }`}
                    >
                      <td className="py-2.5 px-3.5 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200 whitespace-nowrap text-slate-950 font-semibold">
                        <div className="flex items-center gap-1.5">
                          {hasSubs && (
                            <button
                              type="button"
                              onClick={() => toggleSubRow(rowKey)}
                              className="w-4 h-4 rounded text-xs font-bold flex items-center justify-center bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 transition-colors"
                              title={isExpanded ? 'Collapse schedule' : `Expand ${row.subRows!.length} schedule rows`}
                            >
                              {isExpanded ? '−' : '+'}
                            </button>
                          )}
                          <span>{row.label}</span>
                          {hasSubs && (
                            <span className="text-[11px] text-slate-500 font-medium ml-1">
                              ({row.subRows!.length})
                            </span>
                          )}
                        </div>
                      </td>
                      {row.values.map((val, cIdx) => (
                        <td key={cIdx} className="py-2.5 px-3.5 text-right whitespace-nowrap font-mono tabular-nums text-xs sm:text-sm text-slate-900 font-medium">
                          {val === null || val === undefined || val === ''
                            ? '-'
                            : typeof val === 'number'
                            ? val.toLocaleString('en-IN')
                            : val}
                        </td>
                      ))}
                    </tr>

                    {hasSubs &&
                      isExpanded &&
                      row.subRows!.map((sub, sIdx) => (
                        <tr
                          key={`${rowKey}-sub-${sIdx}`}
                          className="bg-indigo-50/30 hover:bg-indigo-50/60 text-slate-900 transition-colors text-xs"
                        >
                          <td className="py-2 px-3.5 pl-8 sticky left-0 bg-indigo-50/60 z-10 border-r border-slate-200 whitespace-nowrap font-medium text-slate-950">
                            <span className="text-indigo-600 mr-1.5 font-bold">↳</span>
                            <span className="text-slate-950 font-semibold">{sub.label}</span>
                          </td>
                          {sub.values.map((sVal, scIdx) => (
                            <td
                              key={scIdx}
                              className="py-2 px-3.5 text-right whitespace-nowrap font-mono tabular-nums text-xs text-slate-900 font-medium"
                            >
                              {sVal === null || sVal === undefined || sVal === ''
                                ? '-'
                                : typeof sVal === 'number'
                                ? sVal.toLocaleString('en-IN')
                                : sVal}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* 1. SLIM TOP HEADER */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 z-30 shadow-2xs">
        {/* Left: Brand + Badge */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <Bot className="w-4 h-4" />
            </div>
            <span className="text-base font-extrabold text-slate-950 tracking-tight">Loan Bazaar AI</span>
          </div>

          <span className="hidden sm:flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
            Live Grounded
          </span>

          {/* New Chat Button */}
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="ml-2 flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-950 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
              title="Start a new chat"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New chat</span>
            </button>
          )}
        </div>

        {/* Right: Full Statements Drawer & Export Buttons (Only after company loaded) */}
        {activeCompany && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-2xs"
              title="Open complete official financial statements and schedules"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-700" />
              <span className="hidden sm:inline">Full Statements &amp; Schedules</span>
              <span className="sm:hidden">Statements</span>
            </button>
            <button
              onClick={() => exportCompanyToExcel(activeCompany)}
              className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold transition-colors"
              title="Download Excel Spreadsheet"
            >
              <Download className="w-4 h-4 text-emerald-700" />
            </button>
          </div>
        )}
      </header>

      {/* 2. SCROLLABLE CHAT AREA (Centered column, max-width ~800px) */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-[800px] mx-auto w-full flex flex-col justify-start min-h-full">
          {/* EMPTY / WELCOME STATE */}
          {messages.length === 0 && (
            <div className="my-auto flex flex-col items-center justify-center text-center py-12 px-4 space-y-5">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
                <Bot className="w-9 h-9" />
              </div>
              <div className="space-y-1.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950">
                  What company do you want to research?
                </h1>
                <p className="text-sm text-slate-600 font-medium">
                  Search by company name, BSE/NSE code or CIN
                </p>
              </div>

              {/* Suggestion Chips */}
              <div className="flex items-center justify-center gap-2 flex-wrap max-w-lg pt-2">
                {WELCOME_SUGGESTION_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => handleSendMessage(chip.query)}
                    className="px-3.5 py-1.5 bg-white hover:bg-indigo-50 border border-slate-300 hover:border-indigo-400 text-slate-800 hover:text-indigo-950 rounded-xl text-xs font-semibold shadow-2xs transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* MESSAGE FLOW */}
          {messages.length > 0 && (
            <div className="space-y-6 pb-6">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex items-start gap-3 w-full ${
                      isUser ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {/* Bot avatar for assistant */}
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-1">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    {/* Message Bubble Container */}
                    <div
                      className={`relative transition-all ${
                        isUser
                          ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-xs px-4 py-3 max-w-[85%] sm:max-w-xl text-sm font-medium shadow-xs'
                          : 'bg-white border border-slate-200 rounded-2xl rounded-tl-xs p-5 sm:p-6 text-sm text-slate-900 shadow-xs max-w-full flex-1'
                      }`}
                    >
                      {/* Assistant Header (Name, Time, Copy) */}
                      {!isUser && (
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-3 pb-2 border-b border-slate-100">
                          <span className="font-bold text-slate-950">Loan Bazaar AI Analyst</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-slate-400">{msg.timestamp}</span>
                            <button
                              onClick={() => handleCopy(msg.id, msg.content)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-950 transition-colors"
                              title="Copy response"
                            >
                              {copiedId === msg.id ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* COMPACT COMPANY CARD (Rendered inside chat for company discovery) */}
                      {!isUser && msg.companyCard && (
                        <div className="mb-4 bg-slate-50 border border-slate-200/90 rounded-xl p-4 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-lg font-extrabold text-slate-950">
                                  {msg.companyCard.name}
                                </h3>
                                <span className="text-xs font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-800">
                                  {msg.companyCard.symbol}
                                </span>
                                <span className="text-[11px] font-mono text-slate-600">
                                  CIN: {msg.companyCard.cin || NOT_AVAILABLE}
                                </span>
                              </div>
                              {msg.companyCard.sector && (
                                <p className="text-xs text-slate-600 font-medium">
                                  Sector: <strong className="text-slate-800">{msg.companyCard.sector}</strong>
                                </p>
                              )}
                            </div>

                            {/* External Links */}
                            <div className="flex items-center gap-3 text-xs text-indigo-700 font-medium flex-wrap">
                              {msg.companyCard.website && (
                                <a
                                  href={msg.companyCard.website}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:underline flex items-center gap-1"
                                >
                                  Website <ExternalLink className="w-3 h-3 text-slate-400" />
                                </a>
                              )}
                              {msg.companyCard.bseUrl && (
                                <a
                                  href={msg.companyCard.bseUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="hover:underline flex items-center gap-1"
                                >
                                  BSE ({msg.companyCard.bseCode || 'Link'}) <ExternalLink className="w-3 h-3 text-slate-400" />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Metric Tiles Inside Company Card */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 pt-1">
                            {msg.companyCard.topRatios.slice(0, 5).map((ratio, i) => (
                              <div
                                key={i}
                                className="bg-white border border-slate-200 rounded-lg p-2 text-center"
                              >
                                <span className="text-[10px] font-bold text-slate-500 uppercase block tracking-wider">
                                  {ratio.name}
                                </span>
                                <span className="text-xs sm:text-sm font-extrabold text-slate-950 font-mono mt-0.5 block">
                                  {ratio.value}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Content Body */}
                      <div className="leading-relaxed">
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        ) : msg.content ? (
                          renderFormattedMarkdown(msg.content)
                        ) : null}
                      </div>

                      {/* SCREENER MATCH CHOICES (CIN resolved to more than one possible company) */}
                      {!isUser && msg.candidates && msg.candidates.length > 0 && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {msg.candidates.map((candidate) => (
                            <button
                              key={candidate.url}
                              onClick={() => handleSendMessage(candidate.symbol, msg.candidateCin)}
                              disabled={loading}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-800 hover:text-indigo-950 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                              {candidate.name} ({candidate.symbol})
                            </button>
                          ))}
                        </div>
                      )}

                      {/* PLAYBOOK CHIPS (Clickable chips below message) */}
                      {!isUser && msg.playbookChips && (
                        <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                          <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                            Audit Playbooks:
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {PLAYBOOK_OPTIONS.map((opt) => (
                              <button
                                key={opt.id}
                                onClick={() => handleSendMessage(opt.prompt)}
                                disabled={loading}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-800 hover:text-indigo-950 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* TYPING INDICATOR (While waiting for response) */}
              {loading && (
                <div className="flex items-start gap-3 w-full">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-1">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-xs p-4 shadow-xs text-sm">
                    <div className="flex items-center gap-1.5 px-1 py-0.5">
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full bg-indigo-600 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* 3. FIXED BOTTOM INPUT BAR */}
      <div className="p-4 bg-white border-t border-slate-200 shrink-0 z-20">
        <div className="max-w-[800px] mx-auto w-full">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(input);
            }}
            className="relative flex items-center bg-slate-50 border border-slate-300 focus-within:border-indigo-600 focus-within:ring-3 focus-within:ring-indigo-100 focus-within:bg-white rounded-2xl p-1.5 transition-all shadow-xs"
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about a company, or type a name / BSE code / CIN…"
              className="flex-1 bg-transparent px-3 py-2 text-sm text-slate-950 placeholder-slate-400 focus:outline-none resize-none max-h-32 leading-relaxed"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="w-9 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white flex items-center justify-center shrink-0 transition-colors shadow-2xs mr-0.5"
              title="Send message"
            >
              <ArrowUp className="w-4 h-4 font-bold" />
            </button>
          </form>
          <p className="text-[11px] text-center text-slate-400 mt-2 font-medium">
            Loan Bazaar AI uses the information on this page. Press Enter to send, Shift+Enter for new line.
          </p>
        </div>
      </div>

      {/* 4. SLIDE-OVER DRAWER: Full Financial Statements & Schedules */}
      {isDrawerOpen && activeCompany && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            onClick={() => setIsDrawerOpen(false)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-4xl bg-white shadow-2xl flex flex-col border-l border-slate-200">
              {/* Drawer Top Bar */}
              <div className="p-5 sm:p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-bold text-slate-950">{activeCompany.name}</h3>
                    <span className="font-mono text-xs font-semibold bg-white px-2 py-0.5 rounded border border-slate-200">
                      {activeCompany.symbol}
                    </span>
                    <span className="font-mono text-xs text-slate-600">
                      CIN: {activeCompany.cin || NOT_AVAILABLE}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Official financial statements and schedules
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {hasBothViews && (
                    <div className="bg-white p-0.5 rounded-lg border border-slate-200 flex items-center text-xs font-semibold">
                      <button
                        onClick={() => setViewMode('consolidated')}
                        className={`px-3 py-1 rounded transition-colors ${
                          viewMode === 'consolidated' ? 'bg-indigo-600 text-white' : 'text-slate-600'
                        }`}
                      >
                        Consolidated
                      </button>
                      <button
                        onClick={() => setViewMode('standalone')}
                        className={`px-3 py-1 rounded transition-colors ${
                          viewMode === 'standalone' ? 'bg-indigo-600 text-white' : 'text-slate-600'
                        }`}
                      >
                        Standalone
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => exportCompanyToExcel(activeCompany)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    title="Export to Excel"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Excel</span>
                  </button>

                  <button
                    onClick={() => exportCompanyToJson(activeCompany)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                    title="Export to JSON"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>JSON</span>
                  </button>

                  <button
                    onClick={() => setIsDrawerOpen(false)}
                    className="p-1.5 text-slate-500 hover:text-slate-950 hover:bg-slate-200 rounded-lg transition-colors ml-1"
                    title="Close Drawer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Statement Tabs */}
              <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0">
                {[
                  { id: 'quarters', label: 'Quarters' },
                  { id: 'profitAndLoss', label: 'P&L (10+ Yrs)' },
                  { id: 'balanceSheet', label: 'Balance Sheet & Schedules' },
                  { id: 'cashFlow', label: 'Cash Flows' },
                  { id: 'ratios', label: 'Efficiency Ratios' },
                  { id: 'shareholding', label: 'Shareholding' },
                  { id: 'peers', label: 'Peers' },
                  { id: 'documents', label: 'Filings & Reports' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setDrawerTab(tab.id as any)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-colors ${
                      drawerTab === tab.id
                        ? 'bg-indigo-50 text-indigo-900 border border-indigo-200 font-bold'
                        : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Statement Content Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {drawerTab === 'quarters' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-950">Quarterly Results</h4>
                      <button
                        onClick={() => {
                          setIsDrawerOpen(false);
                          handleSendMessage(
                            `Analyze quarterly results for ${activeCompany.name}. Compare YoY and QoQ trends.`
                          );
                        }}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-950 flex items-center gap-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Audit Quarters with AI</span>
                      </button>
                    </div>
                    {renderGenericTable(activeFinancials?.quarters, 'Quarterly results not available')}
                  </div>
                )}

                {drawerTab === 'profitAndLoss' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-950">10-Year Profit &amp; Loss Statement</h4>
                      <button
                        onClick={() => {
                          setIsDrawerOpen(false);
                          handleSendMessage(
                            `Analyze long-term sales and profit compounding across 3, 5, and 10 years for ${activeCompany.name}.`
                          );
                        }}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-950 flex items-center gap-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Audit P&amp;L with AI</span>
                      </button>
                    </div>
                    {renderGenericTable(activeFinancials?.profitAndLoss, 'Profit & Loss statements not available')}
                  </div>
                )}

                {drawerTab === 'balanceSheet' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-950">Balance Sheet &amp; Schedules</h4>
                      <button
                        onClick={() => {
                          setIsDrawerOpen(false);
                          handleSendMessage(
                            `Audit the balance sheet and borrowings schedules for ${activeCompany.name}. Calculate Debt-to-Equity.`
                          );
                        }}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-950 flex items-center gap-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Audit Debt &amp; Solvency with AI</span>
                      </button>
                    </div>
                    {renderGenericTable(activeFinancials?.balanceSheet, 'Balance sheet not available')}
                  </div>
                )}

                {drawerTab === 'cashFlow' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-950">Cash Flow Statement</h4>
                      <button
                        onClick={() => {
                          setIsDrawerOpen(false);
                          handleSendMessage(
                            `Calculate Free Cash Flow (CFO - Capex) and examine cash flow quality for ${activeCompany.name}.`
                          );
                        }}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-950 flex items-center gap-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Audit Cash Flows with AI</span>
                      </button>
                    </div>
                    {renderGenericTable(activeFinancials?.cashFlow, 'Cash flow statements not available')}
                  </div>
                )}

                {drawerTab === 'ratios' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-slate-950">Operational Ratios &amp; Working Capital</h4>
                      <button
                        onClick={() => {
                          setIsDrawerOpen(false);
                          handleSendMessage(
                            `Audit the working capital cycle, Debtor Days, and Cash Conversion Cycle for ${activeCompany.name}.`
                          );
                        }}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-950 flex items-center gap-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Audit Efficiency with AI</span>
                      </button>
                    </div>
                    {renderGenericTable(activeFinancials?.ratios, 'Ratios table not available')}
                  </div>
                )}

                {drawerTab === 'shareholding' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-950">Shareholding Pattern</h4>
                        <div className="bg-slate-100 p-0.5 rounded text-xs">
                          <button
                            onClick={() => setShpPeriod('quarterly')}
                            className={`px-2 py-0.5 rounded font-semibold ${shpPeriod === 'quarterly' ? 'bg-white shadow-2xs' : 'text-slate-600'}`}
                          >
                            Quarterly
                          </button>
                          <button
                            onClick={() => setShpPeriod('yearly')}
                            className={`px-2 py-0.5 rounded font-semibold ${shpPeriod === 'yearly' ? 'bg-white shadow-2xs' : 'text-slate-600'}`}
                          >
                            Yearly
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setIsDrawerOpen(false);
                          handleSendMessage(
                            `Audit promoter holding, institutional FII/DII participation, and total shareholders for ${activeCompany.name}.`
                          );
                        }}
                        className="text-xs font-semibold text-indigo-700 hover:text-indigo-950 flex items-center gap-1"
                      >
                        <Bot className="w-3.5 h-3.5" />
                        <span>Audit Ownership with AI</span>
                      </button>
                    </div>
                    {shpPeriod === 'quarterly'
                      ? renderGenericTable(activeFinancials?.shareholdingQuarterly, 'Quarterly shareholding not available')
                      : renderGenericTable(activeFinancials?.shareholdingYearly, 'Yearly shareholding not available')}
                  </div>
                )}

                {drawerTab === 'peers' && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-bold text-slate-950">Industry Peer Comparison</h4>
                    {activeCompany.peers && activeCompany.peers.rows.length > 0 ? (
                      <div className="overflow-x-auto border border-slate-300 rounded-xl bg-white">
                        <table className="w-full text-left border-collapse text-xs sm:text-sm">
                          <thead>
                            <tr className="bg-slate-100 border-b-2 border-slate-300 text-slate-950 font-bold">
                              {activeCompany.peers.headers.map((h, i) => (
                                <th key={i} className={`py-3 px-3.5 whitespace-nowrap ${i <= 1 ? 'sticky left-0 bg-slate-100' : 'text-right'}`}>
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {activeCompany.peers.rows.map((row, rIdx) => {
                              const isSelf =
                                row.name?.toUpperCase() === activeCompany.name.toUpperCase() ||
                                row.name?.toUpperCase() === activeCompany.symbol?.toUpperCase();
                              return (
                                <tr key={rIdx} className={isSelf ? 'bg-indigo-50 font-semibold' : 'hover:bg-slate-50'}>
                                  {activeCompany.peers!.headers.map((h, cIdx) => (
                                    <td key={cIdx} className={`py-2 px-3.5 whitespace-nowrap ${cIdx <= 1 ? 'sticky left-0 bg-white font-semibold' : 'text-right font-mono'}`}>
                                      {row[h] ?? '-'}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No peers available.</p>
                    )}
                  </div>
                )}

                {drawerTab === 'documents' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-200 pb-2 text-xs">
                      {['announcements', 'annualReports', 'concalls', 'creditRatings'].map((t) => (
                        <button
                          key={t}
                          onClick={() => setActiveDocTab(t as any)}
                          className={`px-3 py-1 rounded-md font-semibold capitalize ${
                            activeDocTab === t ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t.replace(/([A-Z])/g, ' $1')}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-2">
                      {activeCompany.documents[activeDocTab].map((doc, dIdx) => (
                        <a
                          key={dIdx}
                          href={doc.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 text-xs font-medium text-slate-900 transition-colors"
                        >
                          <span className="flex-1 pr-3">{doc.title}</span>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
