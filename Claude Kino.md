# KINO — TWENTYONESEVENTEEN Rental Bot

AI assistant for WhatsApp + Instagram, handling equipment rental enquiries and 2117 Studio bookings.

## Stack
- Node.js on Railway
- Supabase — persistent sessions, image storage
- Booqable API — equipment catalog (1000+ products)
- Claude Sonnet — conversation engine (`claude-sonnet-4-6`)
- Meta Cloud API — WhatsApp messaging
- Chatwoot (cloud) — Instagram DM layer (Meta App Review required for direct IG messaging, so Chatwoot handles IG since it's pre-approved)

## Key Files
| File | Purpose |
|---|---|
| `server.js` | Express app, WA + IG webhooks, scheduler bootstrap |
| `handlers/claudeHandler.js` | Core AI logic — askKino(), catalog context, retry logic |
| `handlers/chatwootHandler.js` | IG DM processing via Chatwoot webhook, story mention/reply handling, ad detection |
| `handlers/whatsappHandler.js` | Meta Cloud API sender |
| `handlers/messageHandler.js` | WA message routing, debounce |
| `handlers/notificationHandler.js` | Jeff WA/Telegram alerts ([HUMAN_HANDOFF], [READY_TO_RENT]) |
| `handlers/igMessageHandler.js` | Legacy direct-IG handler (mostly superseded by chatwootHandler.js) |
| `utils/booqableCatalog.js` | Cached catalog (15min TTL), fuzzy search |
| `utils/sessionStore.js` | Supabase session persistence |
| `prompts/kino_system.txt` | Rentals system prompt — voice, pricing rules, active ads, conversation style |
| `prompts/kino_studio_system.txt` | Studio system prompt — rates, events, address |

## Known Constraints
- WhatsApp number `+60 16-217 8573` had a long WATI migration saga — should be Connected now via Meta Cloud API
- Direct Instagram messaging via Meta requires App Review (`instagram_business_manage_messages`) — not yet approved, hence routing through Chatwoot
- Catalog search filters out items under RM20/day to avoid false-positive matches (e.g. "Spring Clip", "Tennis Ball")
- Debounce: 8s on both WA and IG — waits for customer to finish multi-line messages before responding

## Conversation Style (recently tuned)
KINO should sound like Nicholas texting a client — warm, direct, short (2-4 lines), answer first then caveat, one follow-up question max, no corporate phrases ("Certainly!", "Great question!"), natural fillers ("haha", "sir 🙏"). Reference: `prompts/kino_system.txt` → CONVERSATION STYLE section.

## Active Promotions
Creator Ready Bundle — RM1,500/day (Sony FX3/FX6 + 2 lenses + gimbal + tripod + monitors + wireless). Listed in `kino_system.txt` under ACTIVE INSTAGRAM ADS — update this section whenever ad campaigns change.

## Separate Service
`2117-rentals-ig-pipeline` (different Railway project) — auto-posts educational carousel content 3x/week to @2117_rentals. Uses Claude + Puppeteer + Meta Graph API. Not part of this repo.
