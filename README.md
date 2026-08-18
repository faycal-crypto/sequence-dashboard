# Sequence Performance — Bounce Dashboard (Landed)

Live dashboard on Vercel that reads HubSpot sequence emails and reports bounce
performance: bounce rate per sequence, per SDR, per SDR × sequence, and the full
list of contacts who bounced — including each contact's **SDR Legit Email** value
so you can tell a wrong-sequence enrollment from a genuinely bad address.

The numbers come from the **same underlying data as HubSpot's Sequence
Performance report**: each sequence email is an `emails` object carrying
`hs_sequence_id` + `hs_email_status` (`SENT` / `BOUNCED`). We count them directly,
so bounce counts reconcile with the HS report.

---

## 1. Create a HubSpot Private App token

HubSpot → **Settings → Integrations → Private Apps → Create a private app**.

Under **Scopes**, enable:

- `sales-email-read` — read sequence/1:1 emails (this is the key one)
- `crm.objects.contacts.read` — read contact properties (SDR Legit Email, etc.)
- `crm.objects.owners.read` — resolve SDR owner names

Create it and copy the token (`pat-na1-…`).

> Note: this is independent of the "Customer conversation data" AI setting that
> blocks the in-app assistant — a Private App with `sales-email-read` reads these
> emails directly.

## 2. Get the August sequence IDs

Each sequence's ID is the number at the end of its URL:
`…/sequences/**1234567**`. Open each of the 10 August sequences and copy the ID.

Easier alternative: deploy first (steps 3–4), then open **`/api/sequences`** on
your deployed URL. It lists every sequence ID that sent emails in the window,
with send/bounce counts — match those to the names and paste the IDs in.

## 3. Configure

Edit **`lib/sequences.js`**:

- Fill the `id` for each sequence in `SEQUENCES` (names are pre-filled from the
  August list; adjust names to match HubSpot exactly).
- `SDRS` is already set to Madison, Katrina, Jon, Angelica with their verified
  HubSpot owner IDs. Add/remove as needed.

## 4. Deploy to Vercel

**Option A — GitHub (recommended):**

1. Push this folder to a new GitHub repo.
2. In Vercel → **Add New → Project** → import the repo (framework auto-detected
   as Next.js).
3. Add Environment Variables (below) → **Deploy**.

**Option B — Vercel CLI:**

```bash
npm i -g vercel
vercel            # link/create the project
vercel env add HUBSPOT_TOKEN   # paste the token, apply to Production
vercel --prod
```

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `HUBSPOT_TOKEN` | **yes** | Private App token from step 1 |
| `DASHBOARD_PASSWORD` | no | If set, the dashboard asks for this password (Basic auth) |
| `WINDOW_START` | no | `YYYY-MM-DD`; defaults to the 1st of the current month |
| `WINDOW_END` | no | `YYYY-MM-DD`; defaults to today |

## 5. Freshness

- The `/api/metrics` result is cached for 15 min; the **Refresh** button forces a
  live pull (`?fresh=1`).
- `vercel.json` includes an hourly Cron that re-warms the cache so the first load
  is always fast. Vercel Cron requires a Pro plan; on Hobby, the button + the
  15-min cache are enough.

---

## How metrics are computed

- **Attempted** = emails with status `SENT` or `BOUNCED` (emails that actually
  left). **Bounced** = status `BOUNCED`. **Bounce rate** = bounced / attempted.
- **Per SDR** attributes each email to the sender (`email.hubspot_owner_id`) — i.e.
  the SDR who enrolled/sent it. Senders outside the `SDRS` list show as "Other".
- **Bounced contacts** are de-duplicated by contact. `SDR Legit Email = YES` while
  bounced is flagged ⚑ (likely wrong enrollment / stale data); `NO` means the
  address was already flagged bad.
- **NO EMAIL** sequences send no emails, so they correctly show no sends/bounces.

### Reconciling with the HubSpot report

The HS report's **BOUNCES** column counts the same bounced sends, so it should
match. The report's **ENROLLED** column counts enrolled *contacts* (a different
object not exposed the same way via API); this dashboard reports emails *sent*
instead, which is the right denominator for a deliverability/bounce rate. If a
number looks off, `/api/sequences` shows the raw per-sequence send/bounce counts
straight from the API for a quick cross-check.

## Local development

```bash
npm install
echo "HUBSPOT_TOKEN=pat-na1-..." > .env.local
npm run dev      # http://localhost:3000
```
