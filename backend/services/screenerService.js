import * as cheerio from 'cheerio';
import { parseCin } from '../utils/companyHeader.js';
import { CompanyLookupError, findCinForCompanyName, isSameCompanyName, normalizeCompanyName, resolveCin, } from './cinResolver.js';
// In-memory cache with 10-minute TTL
const memoryCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Rate Limiter: Polite delay between outgoing requests to Screener.in
class RateLimiter {
    lastRequestTime = 0;
    minIntervalMs = 200;
    async throttle() {
        const now = Date.now();
        const timeSinceLast = now - this.lastRequestTime;
        if (timeSinceLast < this.minIntervalMs) {
            const waitTime = this.minIntervalMs - timeSinceLast;
            await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
        this.lastRequestTime = Date.now();
    }
}
const rateLimiter = new RateLimiter();
// Track if direct requests to Screener.in are currently blocked by cloud network/firewall
let isDirectBlocked = false;
let directBlockedUntil = 0;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
async function fetchWithRetry(url, requestLogs, headers = {}, retries = 1) {
    await rateLimiter.throttle();
    const startTime = Date.now();
    const reqHeaders = {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers,
    };
    const isHtml = (headers['Accept'] || '').includes('html') || (!url.includes('/api/') && !url.includes('.json'));
    // Resilient proxy gateway fallback helper
    const tryProxyFallback = async (reason) => {
        if (!url.includes('screener.in'))
            return null;
        try {
            const proxyUrl = `https://r.jina.ai/${url}`;
            requestLogs.push({
                timestamp: new Date().toISOString(),
                url: proxyUrl,
                status: 'Gateway Route',
                message: `Direct request encountered ${reason}. Routing via resilient proxy gateway...`,
                durationMs: 0,
            });
            const proxyController = new AbortController();
            const pTimeout = setTimeout(() => proxyController.abort(), 3500);
            const proxyRes = await fetch(proxyUrl, {
                headers: {
                    'X-Return-Format': isHtml ? 'html' : 'text',
                    'X-Engine': 'direct',
                },
                signal: proxyController.signal,
            });
            clearTimeout(pTimeout);
            if (proxyRes.ok) {
                const proxyText = await proxyRes.text();
                const durationMs = Date.now() - startTime;
                requestLogs.push({
                    timestamp: new Date().toISOString(),
                    url,
                    status: proxyRes.status,
                    message: 'OK (via resilient gateway)',
                    durationMs,
                });
                return { status: proxyRes.status, text: proxyText, ok: true };
            }
        }
        catch (proxyErr) {
            console.warn(`Gateway fallback error for ${url}:`, proxyErr.message);
        }
        return null;
    };
    // If direct requests are known to be blocked by firewall, route straight to gateway
    const now = Date.now();
    if (isDirectBlocked && now < directBlockedUntil && url.includes('screener.in')) {
        const directFallback = await tryProxyFallback('active network block on direct IP');
        if (directFallback && directFallback.ok) {
            return directFallback;
        }
    }
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1800);
        const response = await fetch(url, { headers: reqHeaders, signal: controller.signal });
        clearTimeout(timeoutId);
        const durationMs = Date.now() - startTime;
        const text = await response.text();
        requestLogs.push({
            timestamp: new Date().toISOString(),
            url,
            status: response.status,
            message: response.ok ? 'OK' : `HTTP ${response.status} ${response.statusText}`,
            durationMs,
        });
        if (!response.ok && (response.status === 403 || response.status >= 500)) {
            const fallback = await tryProxyFallback(`HTTP ${response.status}`);
            if (fallback)
                return fallback;
            if (retries > 0) {
                await new Promise((r) => setTimeout(r, 600));
                return fetchWithRetry(url, requestLogs, headers, retries - 1);
            }
        }
        return { status: response.status, text, ok: response.ok };
    }
    catch (err) {
        // Remember direct block for 5 minutes so subsequent calls don't stall waiting for timeouts
        if (err.code === 'ECONNREFUSED' ||
            err.name === 'AbortError' ||
            err.message?.includes('refused') ||
            err.message?.includes('fetch failed')) {
            isDirectBlocked = true;
            directBlockedUntil = Date.now() + 5 * 60 * 1000;
        }
        const durationMs = Date.now() - startTime;
        requestLogs.push({
            timestamp: new Date().toISOString(),
            url,
            status: 'Direct Refused',
            message: err.message || 'Direct connection refused',
            durationMs,
        });
        // Try resilient gateway fallback immediately
        const fallback = await tryProxyFallback(err.message || 'connection failure');
        if (fallback)
            return fallback;
        if (retries > 0) {
            console.warn(`Retrying ${url} after error:`, err.message);
            await new Promise((r) => setTimeout(r, 600));
            return fetchWithRetry(url, requestLogs, headers, retries - 1);
        }
        return { status: 0, text: '', ok: false };
    }
}
// Clean number strings into real numbers where possible
export function parseNumericValue(valStr) {
    if (!valStr)
        return null;
    const clean = valStr.replace(/\s+/g, ' ').trim();
    if (clean === '' || clean === '-' || clean === 'N/A' || clean === 'NA')
        return null;
    // Clean commas, currency, and percentage
    const withoutCurrency = clean.replace(/[₹,]/g, '').trim();
    const withoutPercent = withoutCurrency.replace(/%$/, '').trim();
    if (/^-?\d+(\.\d+)?$/.test(withoutPercent)) {
        return parseFloat(withoutPercent);
    }
    return clean;
}
// Extract numeric value from top ratio strings like "₹ 7,50,753 Cr." or "3.08 %"
export function parseRatioNumber(valStr) {
    if (!valStr)
        return {};
    const clean = valStr.replace(/\s+/g, ' ').trim();
    let unit = '';
    if (clean.includes('Cr.'))
        unit = 'Cr.';
    else if (clean.includes('%'))
        unit = '%';
    // If it's a range like "₹ 3,350 / 1,976", do not parse single number
    if (clean.includes('/'))
        return { unit };
    const matches = clean.match(/-?[\d,]+(?:\.\d+)?/);
    if (matches) {
        const num = parseFloat(matches[0].replace(/,/g, ''));
        if (!isNaN(num)) {
            return { num, unit };
        }
    }
    return { unit };
}
// Clean table row label (removes + or - icons, extra spaces)
function cleanRowLabel(raw) {
    if (!raw)
        return '';
    return raw
        .replace(/\s*\+\s*$/, '')
        .replace(/^\s*\+\s*/, '')
        .replace(/\s*-\s*$/, '')
        .replace(/^\s*-\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
}
// Parse standard table section
function extractTableData($, containerSelector, title) {
    const container = $(containerSelector);
    if (!container.length)
        return undefined;
    const table = container.find('table').first();
    if (!table.length)
        return undefined;
    const headers = [];
    table.find('thead th').each((_, th) => {
        const text = $(th).text().replace(/\s+/g, ' ').trim();
        headers.push(text);
    });
    // If thead doesn't exist, check first tr in tbody or table
    if (headers.length === 0) {
        table.find('tr').first().find('th, td').each((_, cell) => {
            headers.push($(cell).text().replace(/\s+/g, ' ').trim());
        });
    }
    const rows = [];
    table.find('tbody tr').each((_, tr) => {
        const cells = $(tr).find('td');
        if (!cells.length)
            return;
        const rawLabel = $(cells[0]).text();
        const label = cleanRowLabel(rawLabel);
        if (!label)
            return;
        const isHighlight = $(tr).hasClass('strong') ||
            $(tr).find('td.name.strong').length > 0 ||
            $(tr).find('strong').length > 0;
        // Detect expandable subdata schedule or shareholder button
        const btn = $(cells[0]).find('button[onclick*="showSchedule"], button[onclick*="showShareholders"]');
        let isExpandable = false;
        let scheduleParent;
        let scheduleSection;
        if (btn.length > 0) {
            const oc = btn.attr('onclick') || '';
            const schedMatch = oc.match(/showSchedule\(\s*[\x27"]([^\x27"]+)[\x27"]\s*,\s*[\x27"]([^\x27"]+)[\x27"]/);
            if (schedMatch) {
                isExpandable = true;
                scheduleParent = schedMatch[1];
                scheduleSection = schedMatch[2];
            }
            else {
                const shMatch = oc.match(/showShareholders\(\s*[\x27"]([^\x27"]+)[\x27"]\s*,\s*[\x27"]([^\x27"]+)[\x27"]/);
                if (shMatch) {
                    isExpandable = true;
                    scheduleParent = shMatch[1];
                    scheduleSection = shMatch[2];
                }
            }
        }
        const values = [];
        cells.slice(1).each((_, td) => {
            const text = $(td).text().trim();
            values.push(parseNumericValue(text));
        });
        rows.push({
            label,
            values,
            isHighlight,
            isExpandable: isExpandable || undefined,
            scheduleParent,
            scheduleSection,
        });
    });
    if (rows.length === 0)
        return undefined;
    return {
        title,
        headers,
        rows,
    };
}
// Parse Compounded Growth / CAGR range tables
function extractGrowthRanges($, containerSelector) {
    const ranges = [];
    $(`${containerSelector} .ranges-table`).each((_, tbl) => {
        const title = $(tbl).find('th').first().text().replace(/\s+/g, ' ').trim();
        const items = [];
        $(tbl).find('tr').each((_, tr) => {
            const tds = $(tr).find('td');
            if (tds.length >= 2) {
                const lbl = $(tds[0]).text().replace(/\s+/g, ' ').trim();
                const val = $(tds[1]).text().replace(/\s+/g, ' ').trim();
                if (lbl)
                    items.push({ label: lbl, value: val });
            }
        });
        if (items.length > 0) {
            ranges.push({ title: title || 'Growth', items });
        }
    });
    return ranges;
}
// Fetch and attach subdata / schedules for all expandable rows
async function populateSubRowsForFinancialSection(section, companyId, isConsolidated, requestLogs) {
    if (!section.available)
        return;
    const tables = [
        section.quarters,
        section.profitAndLoss,
        section.balanceSheet,
        section.cashFlow,
        section.shareholdingQuarterly,
        section.shareholdingYearly,
    ].filter((t) => Boolean(t && t.rows && t.rows.length > 0));
    const fetchTasks = [];
    for (const table of tables) {
        for (const row of table.rows) {
            if (row.isExpandable && row.scheduleParent && row.scheduleSection) {
                const isShareholder = [
                    'promoters',
                    'foreign_institutions',
                    'domestic_institutions',
                    'government',
                    'public',
                ].includes(row.scheduleParent);
                let url = '';
                if (isShareholder) {
                    url = `https://www.screener.in/api/3/${companyId}/investors/${row.scheduleParent}/${row.scheduleSection}/`;
                }
                else {
                    url = `https://www.screener.in/api/company/${companyId}/schedules/?parent=${encodeURIComponent(row.scheduleParent)}&section=${encodeURIComponent(row.scheduleSection)}${isConsolidated ? '&consolidated=' : ''}`;
                }
                fetchTasks.push({
                    row,
                    url,
                    isShareholder,
                    tableHeaders: table.headers.slice(1),
                });
            }
        }
    }
    if (fetchTasks.length === 0)
        return;
    await Promise.all(fetchTasks.map(async (task) => {
        try {
            const res = await fetchWithRetry(task.url, requestLogs, { Accept: 'application/json' });
            if (!res.ok || !res.text)
                return;
            const data = JSON.parse(res.text);
            if (!data || typeof data !== 'object')
                return;
            const subRows = [];
            for (const [subLabel, periodMap] of Object.entries(data)) {
                if (!periodMap || typeof periodMap !== 'object')
                    continue;
                const values = task.tableHeaders.map((headerText) => {
                    const rawVal = periodMap[headerText];
                    if (rawVal === undefined || rawVal === null || rawVal === '')
                        return null;
                    return parseNumericValue(String(rawVal));
                });
                // Check if sub-row has non-zero or defined data
                const hasData = values.some((v) => v !== null && (typeof v === 'number' ? v !== 0 : v !== ''));
                if (hasData) {
                    subRows.push({
                        label: cleanRowLabel(subLabel),
                        values,
                    });
                }
            }
            if (subRows.length > 0) {
                task.row.subRows = subRows;
            }
        }
        catch (err) {
            console.warn(`Failed to fetch schedule for ${task.row.label}:`, err);
        }
    }));
}
// Parse Peers table HTML
function parsePeersHtml(html) {
    const $ = cheerio.load(html);
    const table = $('table').first();
    if (!table.length)
        return undefined;
    const headers = [];
    table.find('th').each((_, th) => {
        headers.push($(th).text().replace(/\s+/g, ' ').trim());
    });
    const rows = [];
    table.find('tbody tr').each((_, tr) => {
        const tds = $(tr).find('td');
        if (!tds.length)
            return;
        const rowObj = {
            name: '',
        };
        tds.each((idx, td) => {
            const headerName = headers[idx] || `Col_${idx}`;
            const rawText = $(td).text().replace(/\s+/g, ' ').trim();
            const num = parseNumericValue(rawText);
            rowObj[headerName] = num !== null ? num : rawText;
            // Assign common columns for convenience
            if (idx === 0)
                rowObj.sNo = rawText;
            if (idx === 1)
                rowObj.name = rawText;
        });
        if (rowObj.name) {
            rows.push(rowObj);
        }
    });
    return { headers, rows };
}
// Parse Financial Section (Quarters, P&L, BS, Cash Flow, Ratios, Shareholding)
function parseFinancialSection($) {
    const quarters = extractTableData($, '#quarters', 'Quarterly Results');
    const profitAndLoss = extractTableData($, '#profit-loss', 'Profit & Loss');
    const balanceSheet = extractTableData($, '#balance-sheet', 'Balance Sheet');
    const cashFlow = extractTableData($, '#cash-flow', 'Cash Flows');
    const ratios = extractTableData($, '#ratios', 'Ratios');
    const growthRanges = extractGrowthRanges($, '#profit-loss');
    // Shareholding tables: Quarterly and Yearly
    // In screener, #quarterly-shp has table and #yearly-shp has table
    let shareholdingQuarterly = extractTableData($, '#quarterly-shp', 'Shareholding Pattern (Quarterly)');
    let shareholdingYearly = extractTableData($, '#yearly-shp', 'Shareholding Pattern (Yearly)');
    // Fallback if specific IDs aren't matched
    if (!shareholdingQuarterly && !shareholdingYearly) {
        const shpTables = $('#shareholding table');
        if (shpTables.length > 0) {
            shareholdingQuarterly = extractTableData($, '#shareholding table:first-of-type', 'Shareholding Pattern (Quarterly)');
        }
        if (shpTables.length > 1) {
            shareholdingYearly = extractTableData($, '#shareholding table:last-of-type', 'Shareholding Pattern (Yearly)');
        }
    }
    // Extract unit notices, e.g. "Figures in Rs. Crores"
    const unitNotice = $('#quarters p.sub, #profit-loss p.sub').first().text().replace(/\s+/g, ' ').trim();
    const hasData = Boolean((quarters && quarters.rows.length > 0) ||
        (profitAndLoss && profitAndLoss.rows.length > 0) ||
        (balanceSheet && balanceSheet.rows.length > 0));
    return {
        available: hasData,
        unitNotice: unitNotice || 'Figures in Rs. Crores',
        quarters,
        profitAndLoss,
        growthRanges,
        balanceSheet,
        cashFlow,
        ratios,
        shareholdingQuarterly,
        shareholdingYearly,
    };
}
// Parse Documents Section
function parseDocuments($) {
    const announcements = [];
    const annualReports = [];
    const creditRatings = [];
    const concalls = [];
    $('#documents .documents').each((_, group) => {
        const title = $(group).find('h3').text().trim().toLowerCase();
        $(group).find('ul li').each((_, li) => {
            const a = $(li).find('a');
            const href = a.attr('href') || '';
            const fullUrl = href.startsWith('http') ? href : `https://www.screener.in${href}`;
            const rawText = a.text().replace(/\s+/g, ' ').trim();
            if (title.includes('announcement')) {
                // Text format: "Announcement under Regulation 30... 1 Oct - Description"
                const dateMatch = rawText.match(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
                announcements.push({
                    title: rawText,
                    date: dateMatch ? dateMatch[0] : '',
                    url: fullUrl,
                });
            }
            else if (title.includes('annual report')) {
                annualReports.push({
                    title: rawText,
                    url: fullUrl,
                });
            }
            else if (title.includes('credit rating')) {
                const agencyMatch = rawText.match(/from\s+([a-zA-Z]+)/i);
                const dateMatch = rawText.match(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+\d{4})?\b/i);
                creditRatings.push({
                    title: rawText,
                    date: dateMatch ? dateMatch[0] : '',
                    agency: agencyMatch ? agencyMatch[1].toUpperCase() : '',
                    url: fullUrl,
                });
            }
            else if (title.includes('concall')) {
                const type = rawText.includes('Transcript')
                    ? 'Transcript'
                    : rawText.includes('PPT')
                        ? 'Presentation'
                        : rawText.includes('Notes')
                            ? 'Notes'
                            : 'Audio';
                concalls.push({
                    title: rawText,
                    type,
                    url: fullUrl,
                });
            }
        });
    });
    return { announcements, annualReports, creditRatings, concalls };
}
function toCandidate(item) {
    if (!item || typeof item.url !== 'string' || typeof item.name !== 'string')
        return null;
    const m = item.url.match(/\/company\/([^\/]+)/i);
    if (!m)
        return null;
    return { name: item.name, symbol: decodeURIComponent(m[1]).toUpperCase(), url: item.url };
}
// Find the Screener.in company for a CIN-resolved registry record: NSE symbol first,
// then BSE code, then the exact company name. A company is used only on an exact match;
// anything merely similar is returned as a candidate for the user to pick.
async function findScreenerMatch(identity, requestLogs) {
    let searchFailed = false;
    const search = async (q) => {
        const res = await fetchWithRetry(`https://www.screener.in/api/company/search/?q=${encodeURIComponent(q)}`, requestLogs, { Accept: 'application/json' });
        try {
            const items = res.ok ? JSON.parse(res.text) : null;
            if (Array.isArray(items)) {
                return items.map(toCandidate).filter((c) => Boolean(c));
            }
        }
        catch {
            // fall through: unreadable response
        }
        searchFailed = true;
        return [];
    };
    // Exchange codes identify a company exactly: accept only the page filed under that code
    for (const code of [identity.nseSymbol, identity.bseCode]) {
        if (!code)
            continue;
        const hit = (await search(code)).find((c) => c.symbol === code.toUpperCase());
        if (hit)
            return { kind: 'one', candidate: hit };
    }
    const target = normalizeCompanyName(identity.name);
    const words = target.split(' ');
    const withoutSuffix = target.replace(/( PRIVATE)? LIMITED$/, '');
    const queries = Array.from(new Set([
        identity.name,
        withoutSuffix,
        withoutSuffix.replace(/ AND /g, ' & '),
        words.slice(0, 2).join(' '),
        words[0],
    ].filter((q) => q && q.length > 1)));
    let similar = [];
    for (const q of queries) {
        const results = await search(q);
        const exact = results.filter((c) => isSameCompanyName(c.name, identity.name));
        if (exact.length === 1)
            return { kind: 'one', candidate: exact[0] };
        if (exact.length > 1)
            return { kind: 'many', candidates: exact };
        if (results.length > 0 && similar.length === 0)
            similar = results.slice(0, 6);
    }
    if (similar.length > 0)
        return { kind: 'many', candidates: similar };
    // An incomplete search is not evidence that the company is missing from Screener
    if (searchFailed) {
        throw new Error('Screener.in search could not be reached. Please try again in a moment.');
    }
    return { kind: 'none' };
}
// Fallback: search web for Screener URL if Screener internal search yielded nothing
async function findScreenerUrlViaSearch(query, requestLogs) {
    try {
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent('site:screener.in ' + query)}`;
        requestLogs.push({
            timestamp: new Date().toISOString(),
            url: searchUrl,
            status: 'Web Lookup',
            message: `Searching for Screener.in page for "${query}"...`,
            durationMs: 0,
        });
        const res = await fetch(searchUrl, {
            headers: {
                'User-Agent': USER_AGENT,
            },
        });
        if (!res.ok)
            return null;
        const html = await res.text();
        const $ = cheerio.load(html);
        let foundUrl = '';
        let foundName = '';
        $('.result').each((_, el) => {
            if (foundUrl)
                return;
            const title = $(el).find('.result__title').text().trim();
            const link = $(el).find('a').attr('href') || '';
            const textLink = $(el).find('.result__url').text().trim();
            const combined = link + ' ' + textLink;
            const m = combined.match(/screener\.in\/company\/([a-zA-Z0-9]+)/i);
            if (m) {
                foundUrl = `/company/${m[1]}/`;
                foundName = title.split('|')[0].split('-')[0].trim();
            }
        });
        if (foundUrl) {
            return { url: foundUrl, name: foundName };
        }
    }
    catch (err) {
        console.warn(`Web lookup failed for ${query}:`, err.message);
    }
    return null;
}
// Master company fetch and parse function
export async function getCompanyData(query, confirmedCin) {
    const enteredQuery = query.trim();
    // Match the app's "Reliance" shortcut to its Screener.in listing.
    const cleanQuery = enteredQuery.toLowerCase() === 'reliance' ? 'Reliance Industries' : enteredQuery;
    if (!cleanQuery) {
        throw new Error('Please enter a company name, stock ticker, or 21-digit CIN number.');
    }
    // A CIN is never sent to Screener.in search: Screener does not index CINs
    const userCin = parseCin(cleanQuery);
    // CIN carried over when the user picked one of several Screener matches for it
    const pickedCin = !userCin && confirmedCin ? parseCin(confirmedCin) : null;
    const cacheKey = `${(userCin || cleanQuery).toUpperCase()}${pickedCin ? `|${pickedCin}` : ''}`;
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        console.log(`[Cache Hit] Returning cached Screener data for ${cacheKey}`);
        return cached.data;
    }
    const requestLogs = [];
    let registry;
    let searchQuery = cleanQuery;
    let matchedUrl = '';
    let companyNameFromSearch = '';
    if (userCin) {
        registry = await resolveCin(userCin, requestLogs);
        if (userCin.startsWith('U')) {
            throw new CompanyLookupError('UNLISTED', 'This is an unlisted company, so it is not on Screener.in', {
                cin: userCin,
                registry,
            });
        }
        const match = await findScreenerMatch({ name: registry.name }, requestLogs);
        if (match.kind === 'none') {
            throw new CompanyLookupError('NOT_ON_SCREENER', `${registry.name} (CIN ${userCin}) is a listed company but was not found on Screener.in. It may be delisted or suspended.`, { cin: userCin, registry });
        }
        if (match.kind === 'many') {
            throw new CompanyLookupError('MULTIPLE_MATCHES', `CIN ${userCin} resolved to ${registry.name}, but Screener.in has more than one possible match.`, { cin: userCin, registry, candidates: match.candidates });
        }
        searchQuery = registry.name;
        matchedUrl = match.candidate.url;
        companyNameFromSearch = match.candidate.name;
    }
    else if (pickedCin) {
        registry = await resolveCin(pickedCin, requestLogs);
    }
    // Step 1: Resolve company via Screener search API (name / ticker / BSE code queries)
    if (!matchedUrl) {
        const searchUrl = `https://www.screener.in/api/company/search/?q=${encodeURIComponent(searchQuery)}`;
        const searchResult = await fetchWithRetry(searchUrl, requestLogs, { Accept: 'application/json' });
        if (searchResult.ok && searchResult.text) {
            try {
                const searchItems = JSON.parse(searchResult.text);
                if (Array.isArray(searchItems) && searchItems.length > 0) {
                    // Check for exact symbol match or choose first
                    const exact = searchItems.find((item) => item.url.toUpperCase().includes(`/${searchQuery.toUpperCase()}/`) ||
                        item.name.toUpperCase() === searchQuery.toUpperCase());
                    const selected = exact || searchItems[0];
                    matchedUrl = selected.url;
                    companyNameFromSearch = selected.name;
                }
            }
            catch (e) {
                console.warn('Failed to parse Screener search JSON:', e);
            }
        }
    }
    // Fallback: If search yielded no results, try web search fallback
    if (!matchedUrl) {
        const webMatch = await findScreenerUrlViaSearch(searchQuery, requestLogs);
        if (webMatch && webMatch.url) {
            matchedUrl = webMatch.url;
            companyNameFromSearch = webMatch.name;
        }
        else {
            const symbolDirect = searchQuery.toUpperCase().replace(/[^A-Z0-9]/g, '');
            matchedUrl = `/company/${symbolDirect}/consolidated/`;
        }
    }
    // Extract symbol
    const symbolMatch = matchedUrl.match(/\/company\/([^\/]+)/i);
    const symbol = symbolMatch ? symbolMatch[1].toUpperCase() : searchQuery.toUpperCase();
    // Step 2: Determine Consolidated & Standalone URLs
    // Screener standard paths:
    // Consolidated: /company/<SYMBOL>/consolidated/
    // Standalone: /company/<SYMBOL>/
    const consolidatedUrl = `https://www.screener.in/company/${symbol}/consolidated/`;
    const standaloneUrl = `https://www.screener.in/company/${symbol}/`;
    // Fetch primary page (try consolidated first if matchedUrl indicated consolidated, else direct)
    const isPrimaryConsolidated = matchedUrl.includes('/consolidated');
    const primaryUrl = isPrimaryConsolidated ? consolidatedUrl : standaloneUrl;
    const primaryFetch = await fetchWithRetry(primaryUrl, requestLogs);
    if (!primaryFetch.ok) {
        // If primary failed, try the other URL
        const altUrl = isPrimaryConsolidated ? standaloneUrl : consolidatedUrl;
        const altFetch = await fetchWithRetry(altUrl, requestLogs);
        if (!altFetch.ok) {
            throw new Error(`Company "${searchQuery}" could not be found on Screener.in. (Checked: ${primaryUrl}, ${altUrl})`);
        }
        return parseFullCompanyProfile(altFetch.text, altUrl, symbol, requestLogs, cacheKey, registry);
    }
    return parseFullCompanyProfile(primaryFetch.text, primaryUrl, symbol, requestLogs, cacheKey, registry);
}
async function parseFullCompanyProfile(html, currentUrl, symbol, requestLogs, cacheKey, registry) {
    const $ = cheerio.load(html);
    // 1. Header Information
    let name = $('h1').first().text().replace(/\s+/g, ' ').trim();
    // Sometimes h1 repeats name twice
    const halfLen = Math.floor(name.length / 2);
    if (name.length > 6 && name.slice(0, halfLen).trim() === name.slice(halfLen).trim()) {
        name = name.slice(0, halfLen).trim();
    }
    const warehouseId = $('#company-info').attr('data-warehouse-id') ||
        $('[data-warehouse-id]').attr('data-warehouse-id');
    const companyId = $('#company-info').attr('data-company-id') ||
        $('[data-company-id]').attr('data-company-id');
    // External Links
    let bseUrl = '';
    let bseCode = '';
    let nseUrl = '';
    let nseCode = '';
    let website = '';
    $('a').each((_, a) => {
        const text = $(a).text().trim();
        const href = $(a).attr('href') || '';
        if (text === 'Website' || text.toLowerCase().includes('website')) {
            website = href;
        }
        else if (text === 'BSE' || href.includes('bseindia.com')) {
            // Keep the first (header) link: later bseindia.com links are announcement PDFs
            if (bseUrl)
                return;
            bseUrl = href;
            const bseMatch = href.match(/\/(\d{5,6})\/?$/);
            if (bseMatch)
                bseCode = bseMatch[1];
        }
        else if (text === 'NSE' || href.includes('nseindia.com')) {
            if (nseUrl)
                return;
            nseUrl = href;
            const nseMatch = href.match(/symbol=([^&]+)/);
            if (nseMatch)
                nseCode = decodeURIComponent(nseMatch[1]);
        }
    });
    // Top Ratios
    const topRatios = [];
    $('#top-ratios li').each((_, li) => {
        const ratioName = $(li).find('.name').text().replace(/\s+/g, ' ').trim();
        const ratioVal = $(li).find('.value, .nowrap').text().replace(/\s+/g, ' ').trim();
        if (ratioName) {
            const { num, unit } = parseRatioNumber(ratioVal);
            topRatios.push({
                name: ratioName,
                value: ratioVal,
                rawNumber: num,
                unit,
            });
        }
    });
    // Sector and Industry
    let sector = '';
    let industry = '';
    const sectorLinks = $('#peers p.sub a');
    if (sectorLinks.length > 0) {
        sector = $(sectorLinks[0]).text().trim();
    }
    if (sectorLinks.length > 1) {
        industry = $(sectorLinks[sectorLinks.length - 1]).text().trim();
    }
    // About
    const about = $('.about, #company-info .about').first().text().replace(/\s+/g, ' ').trim();
    // Pros & Cons
    const pros = [];
    $('#analysis .pros li').each((_, li) => {
        pros.push($(li).text().replace(/\s+/g, ' ').trim());
    });
    const cons = [];
    $('#analysis .cons li').each((_, li) => {
        cons.push($(li).text().replace(/\s+/g, ' ').trim());
    });
    // Check Consolidated vs Standalone toggle links
    // Screener renders "View Standalone" on consolidated page and "View Consolidated" on standalone page
    const hasViewStandaloneLink = html.includes('View Standalone') || html.includes('/#quarters');
    const hasViewConsolidatedLink = html.includes('View Consolidated') || html.includes('/consolidated/#quarters');
    const isCurrentConsolidated = currentUrl.includes('/consolidated');
    let consolidatedSection;
    let standaloneSection;
    if (isCurrentConsolidated) {
        consolidatedSection = parseFinancialSection($);
        // If standalone link exists, fetch standalone page
        if (hasViewStandaloneLink) {
            const standaloneUrl = `https://www.screener.in/company/${symbol}/`;
            const sFetch = await fetchWithRetry(standaloneUrl, requestLogs);
            if (sFetch.ok && sFetch.text) {
                const $s = cheerio.load(sFetch.text);
                standaloneSection = parseFinancialSection($s);
            }
            else {
                standaloneSection = { available: false, unitNotice: 'Not available' };
            }
        }
        else {
            standaloneSection = { available: false, unitNotice: 'Not available' };
        }
    }
    else {
        standaloneSection = parseFinancialSection($);
        // If consolidated link exists, fetch consolidated page
        if (hasViewConsolidatedLink) {
            const consolidatedUrl = `https://www.screener.in/company/${symbol}/consolidated/`;
            const cFetch = await fetchWithRetry(consolidatedUrl, requestLogs);
            if (cFetch.ok && cFetch.text) {
                const $c = cheerio.load(cFetch.text);
                consolidatedSection = parseFinancialSection($c);
            }
            else {
                consolidatedSection = { available: false, unitNotice: 'Not available' };
            }
        }
        else {
            // Company only has Standalone
            consolidatedSection = { available: false, unitNotice: 'Not available' };
        }
    }
    // Documents
    const documents = parseDocuments($);
    // Fetch all subdata schedules and shareholder breakdowns for primary view
    if (companyId) {
        if (consolidatedSection.available) {
            await populateSubRowsForFinancialSection(consolidatedSection, companyId, true, requestLogs);
        }
        else if (standaloneSection.available) {
            await populateSubRowsForFinancialSection(standaloneSection, companyId, false, requestLogs);
        }
    }
    // Separate request for Peers table via warehouse ID
    let peers;
    if (warehouseId) {
        const peersUrl = `https://www.screener.in/api/company/${warehouseId}/peers/`;
        const peersFetch = await fetchWithRetry(peersUrl, requestLogs, { Accept: 'text/html' });
        if (peersFetch.ok && peersFetch.text) {
            peers = parsePeersHtml(peersFetch.text);
        }
    }
    // Searched by name or ticker: resolve the CIN in reverse from the company's exact name.
    // Screener pages do not carry the company's own CIN, so it is never read from page text.
    const cinRecord = registry || (name ? await findCinForCompanyName(name, requestLogs) : null) || undefined;
    const cin = cinRecord?.cin;
    const result = {
        symbol,
        name: name || symbol,
        cin,
        registry: cinRecord,
        warehouseId,
        companyId,
        url: currentUrl,
        bseCode,
        bseUrl,
        nseCode,
        nseUrl,
        website,
        sector,
        industry,
        about,
        topRatios,
        pros,
        cons,
        peers,
        consolidated: consolidatedSection,
        standalone: standaloneSection,
        documents,
        requestLogs,
    };
    // Cache result for 10 minutes
    memoryCache.set(cacheKey, {
        data: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return result;
}
