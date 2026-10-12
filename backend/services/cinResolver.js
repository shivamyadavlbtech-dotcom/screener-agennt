import { execFile } from 'node:child_process';
import * as cheerio from 'cheerio';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CIN_IN_TEXT = /[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}/i;
// Structured lookup failure carried to the client so it can show the right message
export class CompanyLookupError extends Error {
    code;
    details;
    constructor(code, message, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'CompanyLookupError';
    }
}
// RoC state codes used in characters 7-8 of a CIN
const CIN_STATE_CODES = {
    AN: 'Andaman and Nicobar Islands',
    AP: 'Andhra Pradesh',
    AR: 'Arunachal Pradesh',
    AS: 'Assam',
    BR: 'Bihar',
    CH: 'Chandigarh',
    CT: 'Chhattisgarh',
    DD: 'Daman and Diu',
    DL: 'Delhi',
    DN: 'Dadra and Nagar Haveli',
    GA: 'Goa',
    GJ: 'Gujarat',
    HP: 'Himachal Pradesh',
    HR: 'Haryana',
    JH: 'Jharkhand',
    JK: 'Jammu and Kashmir',
    KA: 'Karnataka',
    KL: 'Kerala',
    LA: 'Ladakh',
    LD: 'Lakshadweep',
    MH: 'Maharashtra',
    ML: 'Meghalaya',
    MN: 'Manipur',
    MP: 'Madhya Pradesh',
    MZ: 'Mizoram',
    NL: 'Nagaland',
    OR: 'Odisha',
    PB: 'Punjab',
    PY: 'Puducherry',
    RJ: 'Rajasthan',
    SK: 'Sikkim',
    TG: 'Telangana',
    TN: 'Tamil Nadu',
    TR: 'Tripura',
    UP: 'Uttar Pradesh',
    UR: 'Uttarakhand',
    WB: 'West Bengal',
};
// A CIN encodes its own listing status, state of registration and incorporation year
export function decodeCin(cin) {
    return {
        listingStatus: cin[0] === 'L' ? 'Listed' : 'Unlisted',
        state: CIN_STATE_CODES[cin.slice(6, 8)],
        incorporationYear: cin.slice(8, 12),
    };
}
// Canonical form for exact company-name comparison across MCA and Screener spellings
export function normalizeCompanyName(name) {
    return (name || '')
        .toUpperCase()
        .replace(/&/g, ' AND ')
        .replace(/['’]/g, '')
        .replace(/[^A-Z0-9 ]/g, ' ')
        .replace(/\bLTD\b/g, 'LIMITED')
        .replace(/\bPVT\b/g, 'PRIVATE')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^THE /, '');
}
// Two spellings are the same company only if they agree once spacing is ignored
// ("S.R. Industries Ltd" vs "S R INDUSTRIES LIMITED")
export function isSameCompanyName(a, b) {
    const key = normalizeCompanyName(a).replace(/ /g, '');
    return key.length > 0 && key === normalizeCompanyName(b).replace(/ /g, '');
}
function cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
}
// ZaubaCorp's bot filter rejects Node's own HTTP client (403) but accepts curl,
// so a blocked request is retried through the system curl binary when one exists.
function fetchViaCurl(url) {
    return new Promise((resolve) => {
        execFile('curl', ['-s', '-L', '-m', '15', '-A', USER_AGENT, '-w', '\n%{http_code} %{url_effective}', url], { maxBuffer: 32 * 1024 * 1024, windowsHide: true }, (err, stdout) => {
            if (err || !stdout)
                return resolve(null);
            const cutAt = stdout.lastIndexOf('\n');
            const [code, finalUrl] = stdout.slice(cutAt + 1).trim().split(' ');
            const status = parseInt(code, 10) || 0;
            resolve({
                ok: status >= 200 && status < 300,
                status,
                text: stdout.slice(0, cutAt),
                finalUrl: finalUrl || url,
            });
        });
    });
}
// ZaubaCorp answers HTTP 429 to back-to-back requests, so space them out
let lastZaubaRequestAt = 0;
const ZAUBA_MIN_INTERVAL_MS = 1000;
async function fetchPage(url, requestLogs, label) {
    if (url.includes('zaubacorp.com')) {
        const wait = lastZaubaRequestAt + ZAUBA_MIN_INTERVAL_MS - Date.now();
        if (wait > 0)
            await new Promise((resolve) => setTimeout(resolve, wait));
        lastZaubaRequestAt = Date.now();
    }
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(url, {
            headers: {
                'User-Agent': USER_AGENT,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            signal: controller.signal,
        });
        const text = await res.text();
        clearTimeout(timeout);
        if (res.status === 403 && url.includes('zaubacorp.com')) {
            const viaCurl = await fetchViaCurl(url);
            if (viaCurl) {
                requestLogs.push({
                    timestamp: new Date().toISOString(),
                    url,
                    status: viaCurl.status,
                    message: `${label} (via curl): ${viaCurl.ok ? 'OK' : `HTTP ${viaCurl.status}`}`,
                    durationMs: Date.now() - startTime,
                });
                return viaCurl;
            }
        }
        requestLogs.push({
            timestamp: new Date().toISOString(),
            url,
            status: res.status,
            message: `${label}: ${res.ok ? 'OK' : `HTTP ${res.status}`}`,
            durationMs: Date.now() - startTime,
        });
        return { ok: res.ok, status: res.status, text, finalUrl: res.url || url };
    }
    catch (err) {
        requestLogs.push({
            timestamp: new Date().toISOString(),
            url,
            status: 'Failed',
            message: `${label}: ${err.message || 'request failed'}`,
            durationMs: Date.now() - startTime,
        });
        return { ok: false, status: 0, text: '', finalUrl: url };
    }
}
function buildRegistryInfo(cin, name, source, sourceUrl, fields) {
    const decoded = decodeCin(cin);
    return {
        cin,
        name,
        listingStatus: fields.listingStatus || decoded.listingStatus,
        companyStatus: fields.companyStatus || undefined,
        state: fields.state || decoded.state,
        incorporationYear: fields.incorporationYear || decoded.incorporationYear,
        source,
        sourceUrl,
    };
}
// (a) ZaubaCorp. The page is accepted only if its own CIN field equals the requested CIN:
// Zauba redirects unknown CINs to a search page or to a different company.
async function lookupZauba(cin, requestLogs) {
    const page = await fetchPage(`https://www.zaubacorp.com/company/${cin}`, requestLogs, 'ZaubaCorp CIN lookup');
    if (!page.ok || !page.text)
        return null;
    const $ = cheerio.load(page.text);
    const fields = {};
    $('li.row').each((_, li) => {
        const label = cleanText($(li).children('span').first().text());
        const value = cleanText($(li).children('label').first().text());
        if (label && value && !(label in fields))
            fields[label] = value;
    });
    if ((fields['CIN'] || '').toUpperCase() !== cin)
        return null;
    const name = fields['Name'] || cleanText($('h1').first().text());
    if (!name)
        return null;
    const incorporated = fields['Date of Incorporation'] || '';
    return buildRegistryInfo(cin, name, 'ZaubaCorp', page.finalUrl, {
        listingStatus: fields['Listed on Stock Exchange'],
        companyStatus: fields['Company Status'],
        incorporationYear: (incorporated.match(/\b(18|19|20)\d{2}\b/) || [])[0],
    });
}
// (b) Tofler. Accepted only if the "Registered Details" CIN equals the requested CIN.
async function lookupTofler(cin, requestLogs) {
    const page = await fetchPage(`https://www.tofler.in/x/company/${cin}`, requestLogs, 'Tofler CIN lookup');
    if (!page.ok || !page.text)
        return null;
    const $ = cheerio.load(page.text);
    const fields = {};
    $('#registered-details-module h3').each((_, h3) => {
        const label = cleanText($(h3).text());
        const value = cleanText($(h3).next('span').text());
        if (label && value && !(label in fields))
            fields[label] = value;
    });
    if ((fields['CIN'] || '').toUpperCase() !== cin)
        return null;
    const name = cleanText($('h1').first().text());
    if (!name)
        return null;
    return buildRegistryInfo(cin, name, 'Tofler', page.finalUrl, {
        incorporationYear: ((fields['Incorporation'] || '').match(/\b(18|19|20)\d{2}\b/) || [])[0],
    });
}
// "TATA CONSULTANCY SERVICES LIMITED - L22210MH1995PLC084781 - InstaFinancials" -> company name
function nameFromResultTitle(title) {
    return cleanText(title.split(/\s[-|/·—]\s|\s?\(/)[0]);
}
function decodeSearchResultUrl(href) {
    const m = href.match(/[?&]uddg=([^&]+)/);
    if (!m)
        return href;
    try {
        return decodeURIComponent(m[1]);
    }
    catch {
        return href;
    }
}
// (c) Web search for the exact CIN in quotes. A result counts only if the CIN itself
// appears in its title, URL or snippet next to the company name.
async function lookupWebSearch(cin, requestLogs) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`"${cin}"`)}`;
    const page = await fetchPage(searchUrl, requestLogs, 'Web search for exact CIN');
    if (!page.ok || !page.text)
        return null;
    const $ = cheerio.load(page.text);
    let found = null;
    $('.result').each((_, el) => {
        if (found)
            return;
        const title = cleanText($(el).find('.result__title').text());
        const snippet = cleanText($(el).find('.result__snippet').text());
        const url = decodeSearchResultUrl($(el).find('a.result__a').attr('href') || '');
        // "<NAME> (CIN: <cin>) is a Public company..." is the most reliable phrasing
        const snippetMatch = snippet.match(/^(.{3,120}?)\s*\(CIN:?\s*([A-Z0-9]{21})\)/i);
        if (snippetMatch && snippetMatch[2].toUpperCase() === cin) {
            found = { name: cleanText(snippetMatch[1]), url };
            return;
        }
        if (!`${title} ${url}`.toUpperCase().includes(cin))
            return;
        const name = nameFromResultTitle(title);
        if (name.length > 2 && !CIN_IN_TEXT.test(name)) {
            found = { name, url };
        }
    });
    if (!found)
        return null;
    const { name, url } = found;
    return buildRegistryInfo(cin, name, 'Web search', url || searchUrl, {});
}
const registryCache = new Map();
// Resolve a CIN to its company record: ZaubaCorp, then Tofler, then a quoted web search.
export async function resolveCin(cin, requestLogs) {
    const cached = registryCache.get(cin);
    if (cached)
        return cached;
    for (const lookup of [lookupZauba, lookupTofler, lookupWebSearch]) {
        const info = await lookup(cin, requestLogs);
        if (info) {
            requestLogs.push({
                timestamp: new Date().toISOString(),
                url: info.sourceUrl,
                status: 'CIN Resolved',
                message: `CIN ${cin} verified on ${info.source} as "${info.name}"`,
                durationMs: 0,
            });
            registryCache.set(cin, info);
            return info;
        }
    }
    throw new CompanyLookupError('CIN_UNRESOLVED', `CIN ${cin} could not be resolved from MCA or the other sources`, { cin });
}
// Keep a CIN only when the exact name points at one record (or one listed record)
function pickSingleCin(cins) {
    let list = Array.from(cins);
    if (list.length > 1)
        list = list.filter((c) => c.startsWith('L'));
    return list.length === 1 ? list[0] : null;
}
async function searchZaubaByName(target, requestLogs) {
    // Zauba's search rejects connective words, so retry without them and without the suffix
    const core = target.replace(/\b(AND|LIMITED|PRIVATE)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const slugs = Array.from(new Set([target, core].filter(Boolean))).map((s) => s.replace(/ /g, '-'));
    for (const slug of slugs) {
        const page = await fetchPage(`https://www.zaubacorp.com/companysearchresults/${encodeURIComponent(slug)}`, requestLogs, 'ZaubaCorp name lookup');
        if (!page.ok || !page.text)
            continue;
        const $ = cheerio.load(page.text);
        const exact = new Set();
        $('#resultsList h2 a').each((_, a) => {
            const cinMatch = ($(a).attr('href') || '').match(/-([LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6})\/?$/i);
            if (cinMatch && isSameCompanyName($(a).text(), target))
                exact.add(cinMatch[1].toUpperCase());
        });
        if (exact.size > 0)
            return pickSingleCin(exact);
    }
    return null;
}
async function searchWebByName(target, requestLogs) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`"${target}" CIN`)}`;
    const page = await fetchPage(searchUrl, requestLogs, 'Web search for company CIN');
    if (!page.ok || !page.text)
        return null;
    const $ = cheerio.load(page.text);
    const exact = new Set();
    $('.result').each((_, el) => {
        const title = cleanText($(el).find('.result__title').text());
        const url = decodeSearchResultUrl($(el).find('a.result__a').attr('href') || '');
        const cinMatch = `${url} ${title}`.match(CIN_IN_TEXT);
        if (cinMatch && isSameCompanyName(nameFromResultTitle(title), target)) {
            exact.add(cinMatch[0].toUpperCase());
        }
    });
    return pickSingleCin(exact);
}
// Reverse lookup (company name -> CIN) for companies searched by name or ticker.
// A candidate CIN found by exact name is then confirmed on its own registry page.
export async function findCinForCompanyName(companyName, requestLogs) {
    const target = normalizeCompanyName(companyName);
    if (!target)
        return null;
    const cin = (await searchZaubaByName(target, requestLogs)) || (await searchWebByName(target, requestLogs));
    if (!cin)
        return null;
    try {
        const info = await resolveCin(cin, requestLogs);
        return isSameCompanyName(info.name, target) ? info : null;
    }
    catch {
        return null;
    }
}
