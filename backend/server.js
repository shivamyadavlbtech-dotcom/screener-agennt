import express from 'express';
import { GoogleGenAI } from '@google/genai';
import { loadEnvironment } from './utils/env.js';
loadEnvironment();
const { getCompanyData } = await import('./services/screenerService.js');
const { CompanyLookupError } = await import('./services/cinResolver.js');
const { streamAgentChat, getAgentChatResponse } = await import('./services/agentService.js');
const getGeminiKey = () => (process.env.GEMINI_API_KEY || '').trim();
const hasRealGeminiKey = () => Boolean(getGeminiKey());
const app = express();
const port = Number(process.env.PORT || 3000);
// Browser access is restricted to the deployed frontend URL(s).
const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
app.use((req, res, next) => {
    const origin = String(req.headers.origin || '').replace(/\/+$/, '');
    if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    }
    if (req.method === 'OPTIONS')
        return res.sendStatus(204);
    next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Shared server-side Gemini client
const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
        headers: {
            'User-Agent': 'aistudio-build',
        },
    },
});
// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        hasKey: hasRealGeminiKey(),
        model: 'gemini-2.5-flash',
    });
});
app.get('/health', (_req, res) => {
    res.json({ ok: true });
});
// 1. Resolve & Fetch Company Data
app.get('/api/company', async (req, res) => {
    const query = req.query.q || '';
    if (!query.trim()) {
        return res.status(400).json({ error: 'Query parameter "q" is required.' });
    }
    try {
        const data = await getCompanyData(query, req.query.cin || undefined);
        return res.json(data);
    }
    catch (error) {
        if (error instanceof CompanyLookupError) {
            const failure = {
                error: error.message,
                code: error.code,
                ...error.details,
            };
            return res.status(error.code === 'MULTIPLE_MATCHES' ? 409 : 404).json(failure);
        }
        console.error(`Error fetching company "${query}":`, error);
        return res.status(500).json({
            error: error.message || 'An error occurred while fetching company data.',
        });
    }
});
async function generateWithFallback(contents) {
    try {
        const res = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
        });
        return res.text || '';
    }
    catch (err) {
        console.warn('gemini-2.5-flash call failed, trying gemini-3.5-flash-lite:', err.message);
        const fallbackRes = await ai.models.generateContent({
            model: 'gemini-3.5-flash-lite',
            contents,
        });
        return fallbackRes.text || '';
    }
}
// 2. Dedicated Screener AI Agent Streaming Chat (SSE)
app.post('/api/agent/stream', async (req, res) => {
    const { messages, companyData } = req.body;
    const companies = Array.isArray(companyData) ? companyData : [companyData];
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required.' });
    }
    if (companies.length === 0 || companies.length > 4 || companies.some((company) => !company?.name)) {
        return res.status(400).json({ error: 'One to four company data dossiers are required.' });
    }
    if (!hasRealGeminiKey()) {
        return res.status(500).json({
            error: 'GEMINI_API_KEY is not configured. Add your real Gemini key to .env.local and restart the app.',
        });
    }
    // Set SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    try {
        await streamAgentChat(companyData, messages, (chunk) => {
            res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        });
        res.write(`data: [DONE]\n\n`);
        res.end();
    }
    catch (error) {
        console.error('Agent streaming error:', error);
        res.write(`data: ${JSON.stringify({ error: error.message || 'Streaming failed' })}\n\n`);
        res.end();
    }
});
// 3. Dedicated Screener AI Agent Unary Chat
app.post('/api/agent/chat', async (req, res) => {
    const { messages, companyData } = req.body;
    const companies = Array.isArray(companyData) ? companyData : [companyData];
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Messages array is required.' });
    }
    if (companies.length === 0 || companies.length > 4 || companies.some((company) => !company?.name)) {
        return res.status(400).json({ error: 'One to four company data dossiers are required.' });
    }
    if (!hasRealGeminiKey()) {
        return res.status(500).json({
            error: 'GEMINI_API_KEY is not configured. Add your real Gemini key to .env.local and restart the app.',
        });
    }
    try {
        const answer = await getAgentChatResponse(companyData, messages);
        return res.json({ answer });
    }
    catch (error) {
        console.error('Agent chat error:', error);
        return res.status(500).json({ error: error.message || 'Failed to generate answer from agent.' });
    }
});
// 4. Backward compatible Grounded Q&A Box
app.post('/api/ask', async (req, res) => {
    const { question, companyData } = req.body;
    if (!question || !question.trim()) {
        return res.status(400).json({ error: 'Question is required.' });
    }
    if (!companyData || !companyData.name) {
        return res.status(400).json({ error: 'Company data is required.' });
    }
    if (!hasRealGeminiKey()) {
        return res.status(500).json({
            error: 'GEMINI_API_KEY is not configured. Add your real Gemini key to .env.local and restart the app.',
        });
    }
    try {
        const answer = await getAgentChatResponse(companyData, [
            { role: 'user', content: question.trim() },
        ]);
        return res.json({ answer: answer || 'Not available in the fetched data.' });
    }
    catch (error) {
        console.error('Gemini Q&A error:', error);
        return res.status(500).json({ error: error.message || 'Failed to generate answer.' });
    }
});
// 3. Short Financial Summary
app.post('/api/summary', async (req, res) => {
    const { companyData } = req.body;
    if (!companyData || !companyData.name) {
        return res.status(400).json({ error: 'Company data is required.' });
    }
    if (!process.env.GEMINI_API_KEY) {
        return res.json({ summary: '' });
    }
    try {
        const prompt = `You are a concise equity research analyst.
Review this company data for "${companyData.name}" (${companyData.symbol || ''}).
Provide a crisp 3-bullet summary focusing strictly on:
- Valuation & Size (Market Cap, P/E, ROCE/ROE)
- Recent Performance (Sales & Profit trends from latest Quarters/P&L)
- Key Strength / Concern (from Pros/Cons or Debt/Cash)

STRICT RULES:
- Use ONLY the numbers from the JSON.
- Never invent or estimate numbers.
- If data is missing for a point, state "Not available in the data".
- Return 3 short bullet points, each starting with a bullet marker (•).

DATA:
${JSON.stringify({
            name: companyData.name,
            symbol: companyData.symbol,
            topRatios: companyData.topRatios,
            pros: companyData.pros,
            cons: companyData.cons,
            quarters: companyData.consolidated?.quarters || companyData.standalone?.quarters,
            profitAndLoss: companyData.consolidated?.profitAndLoss || companyData.standalone?.profitAndLoss,
        }).slice(0, 30000)}
`;
        const summary = await generateWithFallback(prompt);
        return res.json({ summary });
    }
    catch (error) {
        console.error('Gemini summary error:', error);
        return res.json({ summary: '' });
    }
});
// API-only backend: frontend is deployed separately.
app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
});
