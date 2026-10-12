import { GoogleGenAI } from '@google/genai';
import { NOT_AVAILABLE, buildCompanyHeaderLine } from '../utils/companyHeader.js';
let ai = null;
function getAIClient() {
    if (!ai) {
        const key = (process.env.GEMINI_API_KEY || '').trim();
        if (!key) {
            throw new Error('GEMINI_API_KEY is not configured. Add your real Gemini key to .env.local and restart the app.');
        }
        ai = new GoogleGenAI({
            apiKey: key,
            httpOptions: {
                headers: {
                    'User-Agent': 'aistudio-build',
                },
            },
        });
    }
    return ai;
}
export const AGENT_MODELS = ['gemini-2.5-flash', 'gemini-3.5-flash-lite'];
const getCompanies = (companyData) => Array.isArray(companyData) ? companyData : [companyData];
function isoDateString(value) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function displayDateLabel(value) {
    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime()))
        return String(value);
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
}
export function formatIndianVolume(value) {
    const numericValue = Number(value ?? 0);
    if (!Number.isFinite(numericValue))
        return '0 shares';
    const rounded = Math.round(numericValue);
    const formatted = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(rounded);
    return `${formatted} shares`;
}
function normalizeTradeDateText(value) {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
function coerceDay(date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
function deriveTickerFromCompanyName(company) {
    const name = String(company?.name || '').trim();
    if (!name)
        return [];
    const stopWords = new Set([
        'LTD', 'LIMITED', 'INDUSTRIES', 'INDUSTRY', 'INDUSTRIAL', 'TECHNOLOGIES', 'TECH', 'TECHNOLOGY',
        'SERVICES', 'SERVICE', 'PHARMA', 'PHARMACEUTICAL', 'CHEMICALS', 'CHEMICAL', 'COMPANY',
        'CORPORATION', 'CORP', 'HOLDINGS', 'HOLDING', 'PVT', 'PRIVATE', 'PL', 'PLC', 'IN', 'AND',
    ]);
    const words = name
        .replace(/[^a-zA-Z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean)
        .filter((word) => !stopWords.has(word.toUpperCase()));
    if (words.length === 0)
        return [];
    const primary = words[0].toUpperCase();
    const variants = [primary, `${primary}.BO`, `${primary}.NS`, `${primary}.NSE`];
    if (words.length > 1) {
        const combined = words.slice(0, 2).join('').toUpperCase();
        variants.push(combined, `${combined}.BO`, `${combined}.NS`);
    }
    return [...new Set(variants.filter(Boolean))];
}
function resolveDefaultTradingDate(company) {
    const series = getCompanyTradingSeries(company);
    if (series.length === 0)
        return new Date();
    const todayIso = isoDateString(coerceDay(new Date()));
    const exactToday = series.find((item) => item.date === todayIso);
    if (exactToday)
        return new Date(`${exactToday.date}T00:00:00Z`);
    const latest = series.at(-1);
    if (!latest)
        return new Date();
    return new Date(`${latest.date}T00:00:00Z`);
}
function getCompanyTradingSeries(company) {
    if (!company)
        return [];
    const candidates = [
        company.priceSeries,
        company.chartData,
        company.marketData,
        company.dailySeries,
        company.volumeSeries,
        company.priceChart,
        company.tradingSeries,
    ];
    const flattened = [];
    for (const candidate of candidates) {
        if (!Array.isArray(candidate))
            continue;
        for (const item of candidate) {
            if (!item || typeof item !== 'object')
                continue;
            const dateValue = item.date || item.tradeDate || item.day || item.timestamp || item.period;
            const volumeValue = Number(item.volume ?? item.tradedVolume ?? item.sharesTraded ?? item.totalVolume ?? item.qty ?? 0);
            const closeValue = Number(item.close ?? item.price ?? item.lastPrice ?? item.closePrice ?? item.value ?? NaN);
            if (!dateValue || !Number.isFinite(volumeValue))
                continue;
            const normalizedDate = new Date(String(dateValue));
            if (Number.isNaN(normalizedDate.getTime()))
                continue;
            flattened.push({
                date: isoDateString(coerceDay(normalizedDate)),
                volume: volumeValue,
                close: Number.isFinite(closeValue) ? closeValue : undefined,
                price: Number.isFinite(closeValue) ? closeValue : undefined,
            });
        }
    }
    return flattened.sort((a, b) => a.date.localeCompare(b.date));
}
export function parse_trading_date(value, company) {
    if (value === null || value === undefined) {
        return resolveDefaultTradingDate(company);
    }
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : coerceDay(value);
    }
    const input = String(value).trim();
    if (!input) {
        return resolveDefaultTradingDate(company);
    }
    const normalized = normalizeTradeDateText(input);
    if (normalized === 'today' || normalized === 'latest' || normalized === 'last trading day') {
        return resolveDefaultTradingDate(company);
    }
    if (normalized === 'yesterday') {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - 1);
        return coerceDay(d);
    }
    const monthDayYear = input.match(/^(\d{1,2})\s*[/\-]\s*(\d{1,2})\s*[/\-]\s*(\d{2,4})$/);
    if (monthDayYear) {
        const [, a, b, c] = monthDayYear;
        const year = Number(c.length === 2 ? `20${c}` : c);
        const month = Number(a);
        const day = Number(b);
        const parsed = new Date(Date.UTC(year, month - 1, day));
        return Number.isNaN(parsed.getTime()) ? null : coerceDay(parsed);
    }
    const dayMonthYear = input.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(?:\s+(\d{2,4}))?$/i);
    if (dayMonthYear) {
        const [, day, monthName, yearText] = dayMonthYear;
        const year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : new Date().getUTCFullYear();
        const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthName.toLowerCase()) + 1;
        const parsed = new Date(Date.UTC(year, month - 1, Number(day)));
        return Number.isNaN(parsed.getTime()) ? null : coerceDay(parsed);
    }
    const monthNameDayYear = input.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{2,4}))?$/i);
    if (monthNameDayYear) {
        const [, monthName, day, yearText] = monthNameDayYear;
        const year = yearText ? Number(yearText.length === 2 ? `20${yearText}` : yearText) : new Date().getUTCFullYear();
        const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(monthName.toLowerCase()) + 1;
        const parsed = new Date(Date.UTC(year, month - 1, Number(day)));
        return Number.isNaN(parsed.getTime()) ? null : coerceDay(parsed);
    }
    const isoLike = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoLike) {
        const [, year, month, day] = isoLike;
        const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        return Number.isNaN(parsed.getTime()) ? null : coerceDay(parsed);
    }
    const direct = new Date(input);
    if (!Number.isNaN(direct.getTime()))
        return coerceDay(direct);
    return null;
}
export function get_volume_by_date(company, date) {
    if (!company || (!company.name && !company.symbol)) {
        return { error: 'Company not found.', volume: undefined, close: undefined, date: undefined, message: 'Company not found.' };
    }
    const series = getCompanyTradingSeries(company);
    if (series.length === 0) {
        return {
            error: 'No trading data available.',
            volume: undefined,
            close: undefined,
            date: undefined,
            message: `No trading data is available for ${company.name || company.symbol || 'this company'} yet.`,
        };
    }
    const requestedDate = parse_trading_date(date ?? 'latest', company);
    if (!requestedDate) {
        return {
            error: 'Invalid date. Please use examples like 09 Oct 2026, 9/10/2026, or today.',
            volume: undefined,
            close: undefined,
            date: undefined,
            message: `Invalid date. Please use examples like 09 Oct 2026, 9/10/2026, or today.`,
        };
    }
    const iso = isoDateString(requestedDate);
    const exactMatch = series.find((item) => item.date === iso);
    if (exactMatch) {
        const message = `Volume of ${company.name || company.symbol || 'Company'} on ${displayDateLabel(exactMatch.date)}: ${formatIndianVolume(exactMatch.volume)}${typeof exactMatch.close === 'number' ? ` (Price: ₹${exactMatch.close.toFixed(2)})` : ''}`;
        return {
            company: company.name || company.symbol || 'Company',
            date: exactMatch.date,
            volume: exactMatch.volume,
            close: exactMatch.close,
            message,
        };
    }
    const previousMatch = [...series].filter((item) => item.date < iso).at(-1);
    if (previousMatch) {
        const message = `No trading data exists for ${displayDateLabel(requestedDate)}. The nearest previous trading day was ${displayDateLabel(previousMatch.date)}: Volume of ${company.name || company.symbol || 'Company'} was ${formatIndianVolume(previousMatch.volume)}${typeof previousMatch.close === 'number' ? ` (Price: ₹${previousMatch.close.toFixed(2)})` : ''}.`;
        return {
            company: company.name || company.symbol || 'Company',
            date: previousMatch.date,
            volume: previousMatch.volume,
            close: previousMatch.close,
            message,
            previousTradingDate: previousMatch.date,
            nearestPreviousTradingDate: previousMatch.date,
        };
    }
    return {
        company: company.name || company.symbol || 'Company',
        error: `No trading data exists for ${displayDateLabel(requestedDate)}.`,
        volume: undefined,
        close: undefined,
        date: undefined,
        message: `No trading data exists for ${displayDateLabel(requestedDate)}.`,
    };
}
export function extractVolumeQueryDate(question) {
    const patterns = [
        /(?:on|for|at|date)\s+((?:today|latest|yesterday|last trading day)|(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-zA-Z]*?(?:\s+\d{2,4})?)|(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4})|(?:\d{4}-\d{1,2}-\d{1,2}))/i,
        /(today|latest|yesterday|last trading day)/i,
    ];
    for (const pattern of patterns) {
        const match = question.match(pattern);
        if (match && match[1])
            return match[1];
        if (match && match[0])
            return match[0];
    }
    return null;
}
async function hydrateCompanyTradingSeries(company) {
    const series = getCompanyTradingSeries(company);
    if (series.length > 0)
        return series;
    const companySymbol = String(company?.nseCode || company?.symbol || '').trim();
    const companyBseCode = String(company?.bseCode || '').trim();
    const fallbackNameTickers = deriveTickerFromCompanyName(company);
    const symbolCandidates = Array.from(new Set([
        `${companySymbol}.NS`,
        `${companySymbol}.BO`,
        companySymbol,
        `${companyBseCode}.BO`,
        `${companyBseCode}.NS`,
        companyBseCode,
        ...fallbackNameTickers.map((ticker) => `${ticker}.NS`),
        ...fallbackNameTickers.map((ticker) => `${ticker}.BO`),
        ...fallbackNameTickers,
    ].filter(Boolean)));
    for (const symbol of symbolCandidates) {
        try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    Accept: 'application/json',
                },
            });
            if (!response.ok)
                continue;
            const payload = await response.json();
            const result = payload?.chart?.result?.[0];
            const quote = result?.indicators?.quote?.[0];
            const timestamps = Array.isArray(result?.timestamp) ? result.timestamp : [];
            const closes = Array.isArray(quote?.close) ? quote.close : [];
            const volumes = Array.isArray(quote?.volume) ? quote.volume : [];
            const hydrated = timestamps
                .map((ts, index) => {
                const close = closes[index];
                const volume = volumes[index];
                if (!Number.isFinite(Number(volume)) || !Number.isFinite(Number(close)))
                    return null;
                return {
                    date: isoDateString(new Date(ts * 1000)),
                    volume: Number(volume),
                    close: Number(close),
                    price: Number(close),
                };
            })
                .filter(Boolean);
            if (hydrated.length > 0) {
                company.priceSeries = hydrated;
                return hydrated;
            }
        }
        catch {
            continue;
        }
    }
    return [];
}
export async function answerVolumeQuestion(companyData, question) {
    const text = (question || '').trim();
    if (!text)
        return null;
    const matchesVolumeIntent = /volume|traded|shares traded|turnover/i.test(text);
    if (!matchesVolumeIntent)
        return null;
    const company = getCompanies(companyData)[0];
    if (!company)
        return null;
    const hydratedSeries = await hydrateCompanyTradingSeries(company);
    if (hydratedSeries.length > 0 && !company.priceSeries) {
        company.priceSeries = hydratedSeries;
    }
    const result = get_volume_by_date(company, extractVolumeQueryDate(text) || undefined);
    return result?.message || null;
}
function normalizeMatchText(value) {
    return (value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function compactFinancialTable(table) {
    if (!table)
        return table;
    return {
        ...table,
        headers: (table.headers || []).slice(0, 12),
        rows: (table.rows || []).slice(0, 12).map((row) => ({
            ...row,
            values: (row.values || []).slice(0, 12),
            subRows: Array.isArray(row.subRows) ? row.subRows.slice(0, 5) : undefined,
        })),
    };
}
function compactCompanyDataForAI(company) {
    const compact = {
        ...company,
        requestLogs: undefined,
        documents: company.documents
            ? {
                announcements: (company.documents.announcements || []).slice(0, 3),
                annualReports: (company.documents.annualReports || []).slice(0, 2),
                creditRatings: (company.documents.creditRatings || []).slice(0, 2),
                concalls: (company.documents.concalls || []).slice(0, 2),
            }
            : undefined,
        consolidated: company.consolidated
            ? {
                ...company.consolidated,
                quarters: compactFinancialTable(company.consolidated.quarters),
                profitAndLoss: compactFinancialTable(company.consolidated.profitAndLoss),
                balanceSheet: compactFinancialTable(company.consolidated.balanceSheet),
                cashFlow: compactFinancialTable(company.consolidated.cashFlow),
                ratios: compactFinancialTable(company.consolidated.ratios),
                shareholdingQuarterly: compactFinancialTable(company.consolidated.shareholdingQuarterly),
                shareholdingYearly: compactFinancialTable(company.consolidated.shareholdingYearly),
            }
            : undefined,
        standalone: company.standalone
            ? {
                ...company.standalone,
                quarters: compactFinancialTable(company.standalone.quarters),
                profitAndLoss: compactFinancialTable(company.standalone.profitAndLoss),
                balanceSheet: compactFinancialTable(company.standalone.balanceSheet),
                cashFlow: compactFinancialTable(company.standalone.cashFlow),
                ratios: compactFinancialTable(company.standalone.ratios),
                shareholdingQuarterly: compactFinancialTable(company.standalone.shareholdingQuarterly),
                shareholdingYearly: compactFinancialTable(company.standalone.shareholdingYearly),
            }
            : undefined,
    };
    return compact;
}
function sanitizeTableDataForAI(table) {
    if (!table)
        return table;
    const headers = (table.headers || [])
        .map((header) => (typeof header === 'string' ? header.replace(/\s+/g, ' ').trim() : String(header)))
        .filter((header) => header !== '');
    const sanitized = {
        ...table,
        headers,
    };
    return sanitized;
}
export function sanitizeCompanyDataForAI(companyData) {
    const companies = getCompanies(companyData).map((company) => {
        const companyClone = structuredClone(company);
        const views = [companyClone.consolidated, companyClone.standalone];
        for (const view of views) {
            if (!view)
                continue;
            const sectionTables = [
                view.quarters,
                view.profitAndLoss,
                view.balanceSheet,
                view.cashFlow,
                view.ratios,
                view.shareholdingQuarterly,
                view.shareholdingYearly,
            ];
            for (const table of sectionTables) {
                if (table) {
                    const sanitized = sanitizeTableDataForAI(table);
                    if (sanitized) {
                        Object.assign(table, sanitized);
                    }
                }
            }
        }
        return companyClone;
    });
    return Array.isArray(companyData) ? companies : companies[0];
}
export function answerSimpleFinancialQuestion(companyData, question) {
    if (!question || !companyData)
        return null;
    const text = question.trim();
    if (!text)
        return null;
    const sanitizedData = sanitizeCompanyDataForAI(companyData);
    const normalizedQuestion = normalizeMatchText(text);
    const relevantCompanies = getCompanies(sanitizedData);
    const company = relevantCompanies[0];
    if (!company)
        return null;
    const activeView = company.consolidated?.available ? company.consolidated : company.standalone || company.consolidated;
    if (!activeView)
        return null;
    const periodTargets = ['mar 2026', 'mar 2025', 'mar 2024', 'mar 2023', 'mar 2022', 'mar 2021', 'mar 2020', 'ttm', 'latest'];
    const targetPeriod = periodTargets.find((period) => normalizedQuestion.includes(period));
    if (!targetPeriod)
        return null;
    const metricAliases = [
        ['sales', 'revenue'],
        ['operating profit', 'op profit', 'ebit'],
        ['net profit', 'profit after tax', 'pat', 'profit'],
        ['ebitda'],
        ['depreciation', 'depreciation and amortisation', 'depreciation and amortisation expense', 'amortisation'],
        ['opm %', 'operating margin', 'operating profit margin'],
        ['expenses', 'total expenses'],
        ['eps', 'earning per share'],
    ];
    const matchedMetric = metricAliases.find(([...aliases]) => aliases.some((alias) => normalizedQuestion.includes(normalizeMatchText(alias))));
    if (!matchedMetric) {
        return null;
    }
    const matchTarget = matchedMetric[0];
    const candidateTables = [
        ...(normalizedQuestion.includes('quarterly') ? [activeView.quarters, activeView.profitAndLoss] : [activeView.profitAndLoss, activeView.quarters]),
        activeView.ratios,
        activeView.cashFlow,
    ];
    for (const table of candidateTables) {
        if (!table?.rows?.length || !table.headers?.length)
            continue;
        const periodIndex = table.headers.findIndex((header) => normalizeMatchText(header).includes(targetPeriod));
        if (periodIndex === -1)
            continue;
        for (const row of table.rows) {
            const label = normalizeMatchText(row.label || '');
            if (!label)
                continue;
            const matchesMetric = label.includes(normalizeMatchText(matchTarget)) || row.label.toLowerCase().includes(matchTarget || '');
            if (!matchesMetric)
                continue;
            const value = row.values[periodIndex];
            if (value === undefined || value === null || value === '')
                continue;
            const formattedValue = typeof value === 'number'
                ? label.includes('%') || (row.label.includes('%') && !row.label.toLowerCase().includes('cr'))
                    ? `${value}%`
                    : `₹ ${value.toLocaleString('en-IN')} Cr.`
                : String(value);
            return `${row.label} for ${table.headers[periodIndex]} = ${formattedValue}. [Source: ${table.title || 'Financial table'} > ${row.label} > ${table.headers[periodIndex]}]`;
        }
    }
    return null;
}
const getIdentityHeader = (companyData) => {
    const companies = getCompanies(companyData);
    if (companies.length === 1)
        return `${buildCompanyHeaderLine(companies[0])}\n\n`;
    return `Companies covered:\n${companies
        .map((company) => `- ${buildCompanyHeaderLine(company)}`)
        .join('\n')}\n\n`;
};
function isTemporaryModelFailure(error) {
    if (!error || typeof error !== 'object')
        return false;
    const apiError = error;
    const status = String(apiError.status || apiError.code || '');
    const retryableStatuses = ['404', '429', '500', '503', 'NOT_FOUND', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE'];
    if (retryableStatuses.includes(status.toUpperCase()))
        return true;
    if (apiError.message) {
        try {
            const response = JSON.parse(apiError.message);
            const responseStatus = String(response.error?.status || response.error?.code || '');
            if (retryableStatuses.includes(responseStatus.toUpperCase()))
                return true;
        }
        catch {
            return /"code"\s*:\s*(404|429|500|503)\b|"status"\s*:\s*"(?:NOT_FOUND|RESOURCE_EXHAUSTED|UNAVAILABLE)"/i.test(apiError.message);
        }
    }
    return false;
}
async function generateContentWithFallback(systemInstruction, contents) {
    let lastError;
    for (const [index, model] of AGENT_MODELS.entries()) {
        try {
            return await getAIClient().models.generateContent({
                model,
                contents,
                config: { systemInstruction, temperature: 0.1 },
            });
        }
        catch (error) {
            lastError = error;
            if (index === AGENT_MODELS.length - 1 || !isTemporaryModelFailure(error)) {
                throw error;
            }
            console.warn(`Gemini model ${model} is temporarily unavailable; retrying with ${AGENT_MODELS[index + 1]}.`);
        }
    }
    throw lastError;
}
/**
 * Builds the comprehensive financial training context and system instruction
 * for the dedicated Screener AI Agent.
 */
export function buildAgentSystemInstruction(companyData) {
    const companies = getCompanies(sanitizeCompanyDataForAI(companyData)).map(compactCompanyDataForAI);
    const companyNames = companies.map((company) => company.name).join(' and ');
    const dossiers = companies
        .map((company) => {
        const viewType = company.consolidated?.available ? 'Consolidated' : 'Standalone';
        return `COMPLETE FINANCIAL DOSSIER FOR ${company.name.toUpperCase()} (${viewType} reporting basis):
================================================================================
${JSON.stringify(company, null, 2)}
================================================================================`;
    })
        .join('\n\n');
    return `You are "Loan Bazaar AI", an elite Chartered Financial Analyst (CFA), forensic accounting expert, and dedicated Equity Research Analyst.
You are exclusively dedicated to answering questions, performing deep-dive financial audits, and analyzing the supplied company dossier${companies.length === 1 ? ` for "${companyNames}"` : `s for ${companyNames}`}.

PRIMARY REPORTING BASIS: Use each company's consolidated statements when available; otherwise use standalone statements.

VOLUME TOOL: Whenever the user asks for a company volume, traded shares, turnover, or a trading-date lookup, use the built-in get_volume_by_date tool with the requested date when provided, or the latest available trading date if no date is mentioned.

YOUR CORE MISSION & BEHAVIOR:
- You can answer questions about every company included in the dossier: revenue trends, quarterly results, 10-12 year P&L, balance sheet forensics, long/short term borrowings, debt schedules, working capital days, cash flows, free cash flow (FCF), return on equity/capital (ROE, ROCE), promoter & institutional shareholding trends, and corporate filings.
- You NEVER give evasive, superficial, or truncated answers. When asked for numbers, you provide the FULL numbers and full tables.
- For multi-company requests, analyze and label each company separately, compare only equivalent periods and reporting bases, and do not combine one company's figures with another's. Use only the supplied dossiers; do not claim data for companies not included here.

CRITICAL INSTRUCTIONS FOR DATA RETRIEVAL & ACCURACY:
1. EXHAUSTIVE DATA RETRIEVAL:
   - When asked for financial statements, periods, or tables (e.g. "show all quarters", "10-year P&L", "balance sheet", "borrowings", "cash flow", "shareholding"):
     ALWAYS output the COMPLETE Markdown table including ALL available columns (periods/years) and rows. Do NOT truncate or say "and so on".
2. EXPANDED SCHEDULES & SUBROWS:
   - Crucial: The company dossier contains granular breakdown schedules located in the 'subRows' property of main financial rows!
   - For Borrowings: Look inside Balance Sheet > Borrowings > 'subRows' for "Long term borrowings", "Short term borrowings", "Lease liabilities", and "Other borrowings".
   - For Fixed Assets: Look inside Balance Sheet > Fixed Assets > 'subRows' for "Land", "Buildings", "Plant Machinery", "CWIP", etc.
   - For Other Liabilities: Look inside Balance Sheet > Other Liabilities > 'subRows' for "Trade Payables", "Advance from Customers", etc.
   - For Shareholding: Look inside 'shareholdingQuarterly' or 'shareholdingYearly' > 'subRows' for granular investor breakdowns.
   - Always present these granular schedules whenever the user asks about debt, borrowings, assets, or ownership.
3. MATHEMATICAL & RATIO CALCULATIONS:
   - You are fully equipped to perform financial calculations when asked:
     * Free Cash Flow (FCF) = Cash from Operations - Fixed Assets Purchased (Capex)
     * Debt-to-Equity Ratio = Total Borrowings / (Equity Capital + Reserves)
     * Interest Coverage Ratio = Operating Profit / Interest Expense (or PBIT / Interest)
     * Operating Profit Margin (OPM %) = (Operating Profit / Sales) * 100
     * Net Profit Margin (%) = (Net Profit / Sales) * 100
     * YoY Growth % = ((Value_current - Value_prior_year) / Value_prior_year) * 100
     * QoQ Growth % = ((Value_current - Value_prior_quarter) / Value_prior_quarter) * 100
     * Cash Conversion Cycle = Debtor Days + Inventory Days - Days Payable
   - Always state the formula and show the exact input values used from the tables.
4. HONESTY ON MISSING DATA:
   - If a specific footnote or metric is not present in the company's financial disclosures, state explicitly: "This metric is not disclosed in the company's current financial filings."
   - Never hallucinate unverified numbers.
5. CITATIONS:
   - Tag the source section and period for any key figure quoted (e.g. "[Quarters > Net Profit (Dec 2024)]", "[Balance Sheet > Borrowings Schedule]", "[Top Ratios > ROCE]").
6. COMPANY IDENTITY & CIN RULES:
   - Every reply is automatically prefixed with these verified company identity lines. Never repeat or print those lines yourself:
     ${companies.map((company) => buildCompanyHeaderLine(company)).join('\n     ')}
   - For multi-company answers, do not add a second "Companies covered" list; the server already adds one.
   - The CIN, NSE symbol, BSE code and company name above are the only verified identifiers. NEVER invent, guess or "correct" a CIN, symbol, BSE code or company name. If one is missing, write "${NOT_AVAILABLE}".
   - The company data source does not index CINs. If the user asks about a different CIN or company, tell them to type that 21-character CIN or company name on its own so it can be resolved through the available registry and matched to the correct company record. Never suggest a CIN lookup failed because of a spelling mistake.
7. CLEAN, HIGH-CONTRAST LIGHT THEME FORMATTING:
   - Format answers using clean Markdown with bold section headers (### Header), neat bullet points, and clean Markdown tables with aligned columns.
   - Indian financial figures should use standard notation: ₹ Cr., ₹ Lakhs, or %.

${dossiers}
`;
}
// History for the model, without the server-added identity line so it is not echoed back
function toModelContents(companyData, messages) {
    const headerLine = getIdentityHeader(companyData);
    return messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content.startsWith(headerLine.trimEnd()) ? m.content.slice(headerLine.trimEnd().length).trimStart() : m.content }],
    }));
}
/**
 * Executes a streaming chat response with the dedicated Screener AI Agent.
 */
export async function streamAgentChat(companyData, messages, onChunk) {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    const instantReply = lastUserMessage ? answerSimpleFinancialQuestion(companyData, lastUserMessage.content) : null;
    if (instantReply) {
        onChunk(instantReply);
        return instantReply;
    }
    const volumeReply = lastUserMessage ? await answerVolumeQuestion(companyData, lastUserMessage.content) : null;
    if (volumeReply) {
        onChunk(volumeReply);
        return volumeReply;
    }
    const systemInstruction = buildAgentSystemInstruction(companyData);
    const contents = toModelContents(companyData, messages);
    let lastError;
    for (const [index, model] of AGENT_MODELS.entries()) {
        let fullText = '';
        const headerLine = getIdentityHeader(companyData);
        try {
            const responseStream = await getAIClient().models.generateContentStream({
                model,
                contents,
                config: {
                    systemInstruction,
                    temperature: 0.1,
                },
            });
            for await (const chunk of responseStream) {
                const chunkText = chunk.text || '';
                if (chunkText) {
                    const out = fullText ? chunkText : headerLine + chunkText;
                    fullText += out;
                    onChunk(out);
                }
            }
            return fullText;
        }
        catch (error) {
            lastError = error;
            if (fullText || index === AGENT_MODELS.length - 1 || !isTemporaryModelFailure(error)) {
                console.error('Error in streamAgentChat:', error);
                throw error;
            }
            console.warn(`Gemini streaming model ${model} is unavailable; retrying with ${AGENT_MODELS[index + 1]}.`);
        }
    }
    throw lastError;
}
/**
 * Unary chat response with the dedicated Screener AI Agent.
 */
export async function getAgentChatResponse(companyData, messages) {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    const instantReply = lastUserMessage ? answerSimpleFinancialQuestion(companyData, lastUserMessage.content) : null;
    if (instantReply) {
        return `${getIdentityHeader(companyData)}${instantReply}`;
    }
    const volumeReply = lastUserMessage ? await answerVolumeQuestion(companyData, lastUserMessage.content) : null;
    if (volumeReply) {
        return `${getIdentityHeader(companyData)}${volumeReply}`;
    }
    const systemInstruction = buildAgentSystemInstruction(companyData);
    const contents = toModelContents(companyData, messages);
    try {
        const res = await generateContentWithFallback(systemInstruction, contents);
        return `${getIdentityHeader(companyData)}${res.text || 'Unable to generate response.'}`;
    }
    catch (error) {
        console.error('Error in getAgentChatResponse:', error);
        throw error;
    }
}
