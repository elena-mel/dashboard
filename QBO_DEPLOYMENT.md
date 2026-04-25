# KB CFO Dashboard - QuickBooks Online Setup

## What changed

- `cfo_app.html` still works by itself and keeps the old hardcoded P&L data as a fallback.
- The `Pull from QBO` button now calls `/api/qbo-pl`.
- If live data is returned, the dashboard stores it in the browser cache and reloads with the fresh numbers.
- If QBO is not connected yet, clicking `Pull from QBO` sends you through the Intuit OAuth screen.
- Your Client Secret is only used by the backend files in `api/`. It is never placed in the HTML.

## Files added

- `api/auth.js` starts the Intuit OAuth flow.
- `api/callback.js` receives the OAuth callback and stores tokens.
- `api/qbo-pl.js` fetches the Profit and Loss report and formats it for the dashboard.
- `api/qbo-balance.js` fetches Balance Sheet cash data.
- `api/qbo-gl.js` fetches the General Ledger report.
- `api/_qbo.js` contains the shared OAuth, token refresh, and QBO report parsing logic.

## Environment variables

Set these in Vercel Project Settings -> Environment Variables:

```text
INTUIT_CLIENT_ID=your Intuit client id
INTUIT_CLIENT_SECRET=your Intuit client secret
INTUIT_REDIRECT_URI=https://your-vercel-app.vercel.app/callback
INTUIT_ENVIRONMENT=production
QBO_COMPANY_ID=your QuickBooks company id
KV_REST_API_URL=from Vercel KV
KV_REST_API_TOKEN=from Vercel KV
ALLOWED_ORIGIN=https://elena-mel.github.io
```

For local testing, copy `.env.example` to `.env` and fill in the same values, but use:

```text
INTUIT_REDIRECT_URI=http://localhost:3000/callback
```

## Intuit redirect URIs

Add both of these in Intuit Developer -> your app -> Keys & OAuth -> Redirect URIs:

```text
http://localhost:3000/callback
https://your-vercel-app.vercel.app/callback
```

## First connection

1. Deploy to Vercel.
2. Open `https://your-vercel-app.vercel.app/api/auth`.
3. Sign in to QuickBooks and approve the app.
4. Intuit redirects back to `/callback`.
5. The dashboard opens and `Pull from QBO` can refresh live P&L data.

## GitHub Pages note

The dashboard defaults to same-domain API calls. If you keep hosting the HTML on GitHub Pages while the backend lives on Vercel, add this before the dashboard script:

```html
<script>
window.KB_QBO_API_BASE = 'https://your-vercel-app.vercel.app';
</script>
```

The simpler option is to host the dashboard and API together on Vercel.
