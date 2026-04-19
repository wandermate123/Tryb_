# Tryb Studios Outbound — Setup (step by step)

Follow these steps in order. You need accounts on **Supabase**, **Apollo.io**, **Google AI Studio**, **Resend**, and (for production) **Vercel**.

---

## 1. Install the app

1. Open a terminal in the project folder:

   `c:\Users\91704\Desktop\Tryb Studio Outbound` (or your clone path).

2. Install dependencies:

   ```bash
   npm install
   ```

---

## 2. Create the database (Supabase)

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → choose org, name, database password, region → create.
3. Wait until the project is ready.
4. Open **Project Settings** → **Database**.
5. Under **Connection string**, choose **URI** (and use the **Transaction** pooler if you deploy serverless—often port `6543` with `pgbouncer=true` in the string; follow Supabase’s current docs).
6. Copy the connection string. Replace `[YOUR-PASSWORD]` with your database password if the placeholder is still there.

You will put this in `.env` as `DATABASE_URL` (next step).

---

## 3. Environment variables

1. In the project root, copy the example env file:

   ```bash
   copy .env.example .env
   ```

   (On macOS/Linux: `cp .env.example .env`.)

2. Open `.env` and fill in:

   | Variable | Where to get it |
   |----------|-----------------|
   | `DATABASE_URL` | Supabase → Database → **Transaction pooler** URI (port 6543, for the running app). |
   | `DIRECT_URL` | Same page → **Direct connection** URI when possible. If `prisma db push` returns **P1001** to `db.<ref>.supabase.co`, your network may block that host—use the **Session pooler** URI instead (port **5432**, user **`postgres.<ref>`**, host **`....pooler.supabase.com`**). Same password; URL-encode special characters. |
   | `APOLLO_API_KEY` | [Apollo.io](https://www.apollo.io/) → Settings / API → REST API key. |
   | `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) → Create API key. |
   | `RESEND_API_KEY` | [Resend](https://resend.com/) → API Keys → create key. |
   | `RESEND_FROM` | A **verified** sender, e.g. `Tryb Studios <notifications@yourdomain.com>`. For quick tests only, Resend’s docs may allow a sandbox sender—use a real domain for production. |
   | `CRON_SECRET` | **Recommended:** any long random string you generate (e.g. from a password manager). Same value must be set on Vercel for production cron (see section 7). |

3. Save `.env`. Never commit `.env` (it should stay gitignored).

---

## 4. Create tables in the database (Prisma)

With `DATABASE_URL` set in `.env`:

```bash
npx prisma db push
```

This creates the `OutboundLead` table (and any other models in `prisma/schema.prisma`).

Optional: use migrations instead:

```bash
npx prisma migrate dev --name init
```

---

## 5. Run the app locally

```bash
npm run dev
```

Open `http://localhost:3000` for the dashboard.

- **Leads** (`/leads`): full list of logged sends.
- **Console** (`/console`): live checklist of which env vars the server sees, pipeline notes, and a detailed manual run panel.

---

## 6. Verify services (before a real send)

1. **Apollo:** your plan must allow `mixed_people/search` and `people/match` (email unlock uses credits).
2. **Gemini:** `GEMINI_API_KEY` must be valid for `gemini-2.5-flash` (or adjust the model in code if your project differs).
3. **Resend:** domain verified for your `RESEND_FROM` address (required for real deliverability).
4. **Database:** `npx prisma db push` completed without errors.

---

## 7. Production (Vercel)

1. Push the repo to GitHub (or connect your Git provider).
2. Import the project in [Vercel](https://vercel.com).
3. Add **the same** environment variables as in `.env` (especially `DATABASE_URL`, Apollo, Gemini, Resend, `RESEND_FROM`).
4. Set **`CRON_SECRET`** in Vercel to the **same** value as in your local `.env` if you use it locally. Vercel cron requests will send `Authorization: Bearer <CRON_SECRET>` when this is configured.
5. Deploy. The sample `vercel.json` schedules `GET /api/cron/outbound` daily—adjust the schedule in the Vercel dashboard if needed.
6. **Timeouts:** each batch paces ~10 seconds between leads; a full run can take **several minutes**. Use a Vercel plan and `maxDuration` that allow long serverless functions, or reduce batch size in code.

---

## 8. First outbound run

1. With all keys set, open the dashboard.
2. If `CRON_SECRET` is set, enter it in the **Token** field on the home page (same value as in `.env`).
3. Click **Start outbound run**.
4. Wait for the run to finish (do not close the tab mid-request).
5. Refresh **Latest results** or open **Leads** to see new rows after successful sends.

**Note:** this sends **real emails** to real addresses returned by Apollo. Use only where you have a legal basis and comply with applicable laws (e.g. CAN-SPAM, GDPR).

---

## 9. Troubleshooting

| Problem | What to check |
|---------|----------------|
| **HTTP 500** on every page after deploy | In Vercel: **Root Directory** must be the folder that contains this app’s `package.json` (not a parent monorepo root unless configured). Redeploy after pulling the latest `next.config.ts` (file tracing is pinned to this project). Confirm **Build Command** runs `prisma generate` (the repo’s `npm run build` already includes it). |
| `Unauthorized` on run | `CRON_SECRET`: paste the exact value in the token field, or unset `CRON_SECRET` only for local dev (not recommended for public URLs). |
| Database errors on `/` or `/leads` | `DATABASE_URL`, Supabase project running, `npx prisma db push`, firewall / IP allowlist. |
| Apollo errors | API key, plan limits, rate limits; check response body in Console manual run. |
| Empty email after match | Normal for some records; Apollo may not return an email for every person. |
| Gemini / Resend errors | Keys, quotas, verified sender for Resend. |

For a live env checklist and raw JSON responses, use **`/console`**.

---

## 10. Track inbound replies (who replied)

1. Pick a mailbox/domain for replies (the same domain used in `RESEND_FROM`).
2. In Resend (or your mail provider), configure an inbound webhook to:

   `https://<your-domain>/api/webhooks/resend/inbound`

3. Add an authorization header to the webhook:

   `Authorization: Bearer <RESEND_INBOUND_WEBHOOK_SECRET>`

4. In your app env (`.env` and Vercel env), set:

   `RESEND_INBOUND_WEBHOOK_SECRET=<same-random-secret>`

5. Run Prisma sync once after pulling latest schema:

   ```bash
   npx prisma db push
   ```

After setup, each inbound reply is saved and the matched lead is marked `Replied` with reply timestamp/snippet.

---

## 11. Files you may edit later

- `prisma/schema.prisma` — data model.
- `app/api/cron/outbound/route.ts` — search filters, pacing, prompts, email copy.
- `vercel.json` — cron schedule.
