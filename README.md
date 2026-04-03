# KINO — WhatsApp AI Assistant
### TWENTYONESEVENTEEN Cinema Equipment Rental

---

## Setup in 5 Steps

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env
```
Open `.env` and fill in:
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `BOOQABLE_API_KEY` — regenerate in Booqable > Settings > API
- `BOOQABLE_BASE_URL` — e.g. `https://yourcompany.booqable.com/api/1`
- `WATI_API_KEY` — from WATI Dashboard > API
- `WATI_BASE_URL` — from WATI Dashboard > API (your live server URL)
- `ADMIN_SECRET` — any strong random string for admin endpoints

### 3. Run locally
```bash
npm run dev
```

### 4. Expose local server for WATI testing
```bash
# Install ngrok: https://ngrok.com
ngrok http 3000
# Copy the https URL e.g. https://abc123.ngrok.io
```

### 5. Set webhook in WATI
WATI Dashboard → Settings → Webhooks → Add:
```
https://abc123.ngrok.io/webhook/wati
```

---

## Deploy to Railway (Production)

1. Push this repo to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Add all environment variables in Railway Settings > Variables
4. Railway auto-deploys. Copy your Railway URL.
5. Update WATI webhook to your Railway URL:
   ```
   https://your-app.railway.app/webhook/wati
   ```

---

## Project Structure

```
kino-bot/
├── server.js                  ← Express server + webhook endpoint
├── handlers/
│   ├── messageHandler.js      ← Main orchestrator
│   ├── claudeHandler.js       ← Claude API (KINO brain)
│   ├── booqableHandler.js     ← Booqable REST API
│   └── watiHandler.js         ← WATI send/assign API
├── utils/
│   ├── sessionStore.js        ← Per-customer conversation history
│   └── discountEngine.js      ← Multi-day + volume discount logic
├── prompts/
│   └── kino_system.txt        ← KINO system prompt (edit to update KINO's behaviour)
├── .env.example               ← Environment variable template
├── railway.toml               ← Railway deployment config
└── README.md
```

---

## Admin Endpoints

### Resume bot after human handoff
```
POST /admin/resume-bot
Body: { "waId": "60123456789", "secret": "your_admin_secret" }
```

### Session stats
```
GET /admin/stats?secret=your_admin_secret
```

### Health check
```
GET /
```

---

## Updating KINO's Behaviour

To update KINO's personality, knowledge, or pricing rules — just edit:
```
prompts/kino_system.txt
```
Then redeploy (Railway auto-deploys on git push).
No code changes needed for content updates.

---

## Team Inbox (WATI)

1. All conversations appear in WATI's shared team inbox
2. Staff can see, assign, and reply to any conversation
3. When KINO triggers a handoff, the conversation is flagged unassigned
4. Staff takes over — bot goes silent automatically
5. After resolving, call `/admin/resume-bot` to let KINO handle again

---

*KINO v1.0 — TWENTYONESEVENTEEN Studio Sdn Bhd 202001036868 (1393189-K)*
