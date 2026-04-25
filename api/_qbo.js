const crypto = require('crypto');

const TOKEN_KEY = 'kb:qbo:tokens';
const STATE_KEY = 'kb:qbo:oauth-state';
const ACCOUNTING_SCOPE = 'com.intuit.quickbooks.accounting';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';

const DASHBOARD_ACCOUNTS = [
  'Bookkeeping Services',
  'Cleanup Services',
  'Commission Income',
  'Gusto Income',
  'Client Subscriptions',
  'Contractors — Account Manager',
  'Contractors — Rowena',
  'Advertising & Marketing',
  'Bank Charges & Fees',
  'Business Consulting',
  'Car & Truck',
  'Insurance',
  'Office Supplies & Software',
  'QuickBooks Payments Fees',
  'Taxes & Licenses',
  'Travel',
  'Utilities',
  'Payroll Taxes (Employer)',
  'Payroll Wages (Elena)'
];

const ACCOUNT_ALIASES = {
  'bookkeeping services': 'Bookkeeping Services',
  'bookkeeping service': 'Bookkeeping Services',
  'cleanup services': 'Cleanup Services',
  'cleanup service': 'Cleanup Services',
  'commission income': 'Commission Income',
  'gusto income': 'Gusto Income',
  'gusta income': 'Gusto Income',
  'client subscriptions': 'Client Subscriptions',
  'client subscription': 'Client Subscriptions',
  'contractors - account manager': 'Contractors — Account Manager',
  'contractors account manager': 'Contractors — Account Manager',
  'contractors - rowena': 'Contractors — Rowena',
  'contractors rowena': 'Contractors — Rowena',
  'advertising & marketing': 'Advertising & Marketing',
  'advertising and marketing': 'Advertising & Marketing',
  'bank charges & fees': 'Bank Charges & Fees',
  'bank charges and fees': 'Bank Charges & Fees',
  'business consulting': 'Business Consulting',
  'car & truck': 'Car & Truck',
  'car and truck': 'Car & Truck',
  'insurance': 'Insurance',
  'office supplies & software': 'Office Supplies & Software',
  'office supplies and software': 'Office Supplies & Software',
  'quickbooks payments fees': 'QuickBooks Payments Fees',
  'quickbooks payment fees': 'QuickBooks Payments Fees',
  'taxes & licenses': 'Taxes & Licenses',
  'taxes and licenses': 'Taxes & Licenses',
  'travel': 'Travel',
  'utilities': 'Utilities',
  'payroll taxes (employer)': 'Payroll Taxes (Employer)',
  'payroll taxes employer': 'Payroll Taxes (Employer)',
  'payroll wages (elena)': 'Payroll Wages (Elena)',
  'payroll wages elena': 'Payroll Wages (Elena)'
};

const memoryStore = new Map();

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function requiredEnv(name) {
  const value = env(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function apiBase() {
  return env('INTUIT_ENVIRONMENT', 'production') === 'sandbox'
    ? 'https://sandbox-quickbooks.api.intuit.com'
    : 'https://quickbooks.api.intuit.com';
}

function redirectUri(req) {
  if (env('INTUIT_REDIRECT_URI')) return env('INTUIT_REDIRECT_URI');
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/callback`;
}

function basicAuth() {
  const raw = `${requiredEnv('INTUIT_CLIENT_ID')}:${requiredEnv('INTUIT_CLIENT_SECRET')}`;
  return Buffer.from(raw).toString('base64');
}

function encodeStore(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function decodeStore(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

async function kvGet(key) {
  const url = env('KV_REST_API_URL');
  const token = env('KV_REST_API_TOKEN');
  if (!url || !token) return memoryStore.get(key) || null;
  const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`KV get failed: ${res.status}`);
  const data = await res.json();
  return data.result ? decodeStore(data.result) : null;
}

async function kvSet(key, value) {
  const url = env('KV_REST_API_URL');
  const token = env('KV_REST_API_TOKEN');
  if (!url || !token) {
    memoryStore.set(key, value);
    return;
  }
  const stored = encodeStore(value);
  const res = await fetch(`${url}/set/${encodeURIComponent(key)}/${stored}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`KV set failed: ${res.status}`);
}

async function saveTokens(tokens, realmId) {
  await kvSet(TOKEN_KEY, {
    ...tokens,
    realmId,
    accessTokenExpiresAt: Date.now() + Math.max(0, (tokens.expires_in || 3600) - 120) * 1000,
    refreshTokenExpiresAt: Date.now() + Math.max(0, tokens.x_refresh_token_expires_in || 0) * 1000,
    savedAt: new Date().toISOString()
  });
}

async function exchangeToken(body) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `Token exchange failed: ${res.status}`);
  return data;
}

async function exchangeCodeForTokens(code, realmId, req) {
  const tokens = await exchangeToken(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(req)
  }));
  await saveTokens(tokens, realmId);
  return tokens;
}

async function refreshTokens(current) {
  const tokens = await exchangeToken(new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token
  }));
  await saveTokens(tokens, current.realmId || env('QBO_COMPANY_ID'));
  return kvGet(TOKEN_KEY);
}

async function getAccessToken() {
  const current = await kvGet(TOKEN_KEY);
  if (!current?.refresh_token) {
    const err = new Error('QuickBooks is not authorized yet.');
    err.statusCode = 401;
    throw err;
  }
  if (current.access_token && Date.now() < current.accessTokenExpiresAt) return current;
  return refreshTokens(current);
}

async function qboFetch(reportName, params = {}) {
  const tokens = await getAccessToken();
  const realmId = tokens.realmId || env('QBO_COMPANY_ID');
  if (!realmId) throw new Error('Missing QBO company ID / realmId');
  const url = new URL(`${apiBase()}/v3/company/${realmId}/reports/${reportName}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });
  url.searchParams.set('minorversion', env('QBO_MINOR_VERSION', '75'));
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      Accept: 'application/json'
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.Fault?.Error?.[0]?.Message || `QBO ${reportName} failed: ${res.status}`);
  return data;
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[—–]/g, '-')
    .replace(/[^a-z0-9&() -]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAmount(value) {
  if (value === undefined || value === null || value === '') return 0;
  const raw = String(value).replace(/[$,]/g, '').trim();
  if (/^\(.+\)$/.test(raw)) return -Number(raw.slice(1, -1));
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function collectReportRows(rows, out = {}) {
  (rows?.Row || []).forEach((row) => {
    const nested = row.Rows?.Row;
    if (nested) collectReportRows({ Row: nested }, out);
    if (!row.ColData?.length) return;
    const label = row.ColData[0]?.value;
    const account = ACCOUNT_ALIASES[normalizeName(label)];
    if (!account) return;
    out[account] = row.ColData.slice(1).map((col) => parseAmount(col.value));
  });
  return out;
}

function monthColumnCount(report) {
  const cols = report.Columns?.Column || [];
  return Math.max(1, cols.filter((col, idx) => idx > 0 && !/^total$/i.test(col.ColTitle || '')).length);
}

function formatPL(report) {
  const monthCount = monthColumnCount(report);
  const rows = collectReportRows(report.Rows);
  const pl = {};
  DASHBOARD_ACCOUNTS.forEach((account) => {
    const values = rows[account] || [];
    pl[account] = Array.from({ length: 12 }, (_, idx) => Number(values[idx] || 0));
  });
  return {
    pl,
    actualMonths: monthCount,
    fetchedAt: new Date().toISOString(),
    source: 'quickbooks-online'
  };
}

function currentYearRange(req) {
  const year = Number(req.query.year) || new Date().getFullYear();
  const today = new Date();
  const end = year === today.getFullYear()
    ? today.toISOString().slice(0, 10)
    : `${year}-12-31`;
  return { start_date: `${year}-01-01`, end_date: end };
}

function authUrl(req) {
  const state = crypto.randomBytes(24).toString('hex');
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', requiredEnv('INTUIT_CLIENT_ID'));
  url.searchParams.set('redirect_uri', redirectUri(req));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', ACCOUNTING_SCOPE);
  url.searchParams.set('state', state);
  return kvSet(STATE_KEY, { state, expiresAt: Date.now() + 10 * 60 * 1000 }).then(() => url.toString());
}

async function verifyState(state) {
  const saved = await kvGet(STATE_KEY);
  return !!saved && saved.state === state && Date.now() < saved.expiresAt;
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', env('ALLOWED_ORIGIN', 'https://elena-mel.github.io'));
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.end(JSON.stringify(body));
}

function handleOptions(req, res) {
  if (req.method !== 'OPTIONS') return false;
  sendJson(res, 204, {});
  return true;
}

module.exports = {
  authUrl,
  currentYearRange,
  exchangeCodeForTokens,
  formatPL,
  handleOptions,
  qboFetch,
  sendJson,
  verifyState
};
