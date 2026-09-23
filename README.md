# Flux

**A lightweight, self-hosted Grafana alternative for small teams and MSMEs.**

Grafana + Prometheus is a superb stack — and an unreasonable one if you run two
websites and a shop. Flux does the one thing a small operator actually needs:
watch how much traffic a site is getting, and **send an SMS when it spikes past
a threshold you set**.

Built as an SDG-9 (Industry, Innovation and Infrastructure) mini project on the
MERN stack — MongoDB, Express, React, Node.

```
   a site you run                 Flux server                  you
  ┌───────────────┐          ┌──────────────────┐        ┌───────────┐
  │ flux-agent    │  POST    │ ingestion API    │        │  📱 SMS   │
  │ counts reqs   │ ───────► │ MongoDB storage  │ ─────► │  (Twilio) │
  └───────────────┘  /api/   │ alert worker     │        └───────────┘
                     metrics └────────┬─────────┘
                                      │ GET /api/sites/:id/metrics
                                      ▼
                              ┌──────────────────┐
                              │ React dashboard  │
                              └──────────────────┘
```

---

## What's in the box

| Folder    | What it is                                                           |
| --------- | -------------------------------------------------------------------- |
| `server/` | Express ingestion API, MongoDB (Mongoose) storage, cron alert worker |
| `client/` | The Flux dashboard — React + Vite + Tailwind + Recharts              |
| `agent/`  | `flux-agent` — the tiny drop-in counter a site owner installs        |

---

## Quick start (about two minutes)

You need **Node 18+**. You do *not* need MongoDB installed — see
[Database](#database) below.

```bash
npm run install:all          # or: npm install in server/, client/ and agent/
```
```bash
cd server && npm start       # terminal 1 — API + alert worker
```
```bash
cd client && npm run dev     # terminal 2 — dashboard on :5173
```

On its first run against an empty database the server **creates three demo
sites**, backfills 15 minutes of baseline traffic for each, prints their API
keys, and writes `client/.env.local` so the dashboard connects with no
copy-paste:

```
────────────────────────────────────────────────────────────────────────────
  SITE                   API KEY                                   THRESHOLD
  api.mystore.in         flux_8121759ee174e071545f370c08ba356f      480
  checkout.mystore.in    flux_5d85277177c213e91d0642507c7c0aef      480
  cdn.mystore.in         flux_e16f76a80eb447c2e405032ec325c58f      480
────────────────────────────────────────────────────────────────────────────
```

Open <http://localhost:5173>.

---

## The 5-minute demo

1. **Show the dashboard.** Three sites in the sidebar, each sitting at roughly
   220 requests per 4-second window, well under the dashed 480 threshold line.
2. **Point a "customer site" at Flux** (terminal 3):
   ```bash
   cd agent && npm run example
   ```
   A toy Express app on `:3000` instrumented with `flux-agent`, generating its
   own synthetic visitors. The chart moves within ~5 seconds.
3. **Set your phone number** so the SMS has somewhere to go:
   ```bash
   curl -X PATCH http://localhost:4000/api/sites/api.mystore.in \
     -H "Authorization: Bearer $FLUX_API_KEY" \
     -H "content-type: application/json" \
     -d '{"phone_number":"+919876543210"}'
   ```
4. **Trip the threshold** (terminal 4):
   ```bash
   cd server && npm run burst
   ```
5. **Watch it fire.** Within four seconds the worker logs the breach, the SMS
   goes out, the line punches through the threshold, `Current` turns red, and a
   row appears under *Recent alerts*.
6. **Run `npm run burst` again** — traffic keeps climbing but no second SMS
   arrives. That's the 5-minute cooldown doing its job.

---

## How the numbers line up

One plotted point, the threshold line, and the alert window are all **the same
unit: requests per 4 seconds**. That is deliberate — a threshold line drawn over
a series measured differently would be meaningless.

- `ALERT_WINDOW_SECONDS=4` — the worker sums the last 4s and compares it to the
  site's `alert_threshold`.
- The dashboard requests `?bucket=4`, so each point is one 4-second window.
- `ALERT_CRON=*/4 * * * * *` — checks are contiguous, so a short spike cannot
  slip between two evaluations.

Widen all three together if you want a calmer alert (e.g. 60s windows checked
every 60s).

---

## Database

`server/.env` sets `MONGODB_URI`. Flux tries it, and falls back automatically:

| Setup                    | What to do                                                    |
| ------------------------ | ------------------------------------------------------------- |
| **Nothing installed**    | Just run it. Flux starts an **in-memory MongoDB** (data is lost on restart — perfect for a demo). |
| **Local mongod**         | `MONGODB_URI=mongodb://127.0.0.1:27017/flux`                   |
| **MongoDB Atlas (free)** | `MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/flux` |

Set `USE_MEMORY_DB=true` to force the in-memory database even when a real one is
reachable.

> **Demo gotcha:** with the in-memory database, restarting the server wipes it,
> so **new API keys are minted** and `client/.env.local` is rewritten. Vite bakes
> env vars in at startup, so restart `client` (and the agent) after restarting
> the server, or the dashboard will sit there showing `disconnected`. Point
> `MONGODB_URI` at a real MongoDB if you want the keys to stay put.

### Collections

**`sites`**

| Field             | Type   | Notes                                 |
| ----------------- | ------ | ------------------------------------- |
| `_id`             | string | Human-friendly id, e.g. `api.mystore.in` |
| `name`            | string |                                       |
| `api_key`         | string | `flux_…`, unique, minted on creation  |
| `alert_threshold` | number | Requests per alert window             |
| `phone_number`    | string | E.164, or `null` to skip SMS          |

**`metrics`** — `site_id`, `timestamp` (unix seconds), `request_count`

**`alerts`** — `site_id`, `fired_at`, `request_count`, `threshold`, `message`,
`sms_status` (`sent` / `failed` / `skipped`)

---

## API

Every endpoint except site creation needs a site's API key:

```
Authorization: Bearer flux_8121759e…
```
(or `x-api-key: flux_8121759e…`)

**Writes are scoped, reads are not.** `POST /api/metrics` only accepts data for
the site the key belongs to, so one site's agent can never forge another's
numbers. The `GET` endpoints are readable across sites, because the dashboard is
a single-operator view over everything this server watches.

### `POST /api/metrics`

```bash
curl -X POST http://localhost:4000/api/metrics \
  -H "Authorization: Bearer $FLUX_API_KEY" \
  -H "content-type: application/json" \
  -d '{"site_id":"api.mystore.in","timestamp":1790142772,"request_count":42}'
```

`timestamp` is optional (defaults to now) and accepts unix seconds, unix millis
or an ISO string. Timestamps more than 5 minutes in the future are rejected —
one bad clock would otherwise stretch every chart's time axis out to meet it.

### `GET /api/sites/:site_id/metrics?window=2m&bucket=4`

Everything the dashboard needs in one poll. `window` accepts `90s`, `15m`, `2h`,
`1d` (10s–7d); `bucket` pins the width of a point (omit it and Flux picks a
width giving ~60 points).

```json
{
  "site": { "id": "api.mystore.in", "name": "api.mystore.in", "alert_threshold": 480 },
  "window_seconds": 120,
  "bucket_seconds": 4,
  "alert_window_seconds": 4,
  "points": [{ "timestamp": 1790142672, "request_count": 205 }],
  "stats": { "current": 223, "average": 233, "peak": 251, "total": 6045 },
  "alerts": []
}
```

### Other endpoints

| Endpoint                             | Purpose                                       |
| ------------------------------------ | --------------------------------------------- |
| `POST /api/sites`                    | Register a site, returns the API key **once** |
| `GET /api/sites`                     | List sites (secrets stripped) — feeds the sidebar |
| `GET /api/sites/:id`                 | One site's config                             |
| `PATCH /api/sites/:id`               | Change threshold / phone / name (own key)     |
| `GET /api/sites/:id/alerts?limit=25` | Alert history                                 |
| `GET /api/health`                    | Site count, Twilio mode, uptime               |

Registering a site:

```bash
curl -X POST http://localhost:4000/api/sites \
  -H "content-type: application/json" \
  -d '{"id":"corner-shop","name":"Corner Shop","alert_threshold":300,"phone_number":"+919876543210"}'
```

`POST /api/sites` is open for local development. Set `ADMIN_TOKEN` in
`server/.env` to require an `x-admin-token` header.

---

## Pointing a site at Flux

Install the agent (copy `agent/flux-agent.js` into your project, or
`npm install ../path/to/FLUX/agent`) and add one line:

```js
import express from 'express';
import { fluxAgent } from 'flux-agent';

const app = express();

app.use(fluxAgent({
  url: 'http://localhost:4000',
  siteId: 'api.mystore.in',
  apiKey: process.env.FLUX_API_KEY,
  intervalSeconds: 10,
}));
```

It keeps an in-memory counter and POSTs the total every `intervalSeconds`. If
Flux is down the sample is dropped and your site keeps serving — monitoring
never takes the app with it.

Not using Express? Use the counter directly:

```js
import { createFluxReporter } from 'flux-agent';

const flux = createFluxReporter({ url, siteId, apiKey });
flux.increment();   // wherever you handle a request
flux.stop();        // on shutdown
```

---

## Configuring alerts

### Threshold and phone number

```bash
curl -X PATCH http://localhost:4000/api/sites/api.mystore.in \
  -H "Authorization: Bearer $FLUX_API_KEY" \
  -H "content-type: application/json" \
  -d '{"alert_threshold":600,"phone_number":"+919876543210"}'
```

Phone numbers must be **E.164** (`+` and country code). A site with no phone
number still records alerts — the SMS is marked `skipped`.

### Cooldown

`ALERT_COOLDOWN_SECONDS` (default: 300) caps alerts at one per site per five
minutes, however long the spike lasts — a sustained breach is one text, not
forty. Suppressed checks are logged:

```
[alerting] api.mystore.in still breaching (2880 > 480) but in cooldown for another 296s
```

### Twilio

Without credentials Flux runs in **dry-run mode**: alerts are recorded and the
message is printed to the console, no SMS is sent. Nothing else changes, so the
whole project demos with zero cloud accounts.

To send real texts, put your [Twilio](https://www.twilio.com/try-twilio) trial
credentials in `server/.env`:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+15005550006
```

On a Twilio **trial account** you can only text numbers you've verified in the
console — verify your own number first.

---

## Configuration reference (`server/.env`)

| Variable                 | Default                          | Meaning                                  |
| ------------------------ | -------------------------------- | ---------------------------------------- |
| `PORT`                   | `4000`                           | API port                                 |
| `MONGODB_URI`            | `mongodb://127.0.0.1:27017/flux` | Falls back to in-memory if unreachable   |
| `USE_MEMORY_DB`          | `false`                          | Force the in-memory database             |
| `ALERT_CRON`             | `*/4 * * * * *`                  | How often sites are evaluated            |
| `ALERT_WINDOW_SECONDS`   | `4`                              | Rolling window compared to the threshold |
| `ALERT_COOLDOWN_SECONDS` | `300`                            | Minimum gap between alerts for one site  |
| `TWILIO_*`               | *(empty)*                        | Empty ⇒ dry-run mode                     |
| `ADMIN_TOKEN`            | *(empty)*                        | Empty ⇒ `POST /api/sites` is open        |
| `AUTOSEED`               | `true`                           | Create demo sites on an empty database   |
| `DEMO_PHONE_NUMBER`      | *(empty)*                        | Default number for the seeded sites      |

The dashboard reads `client/.env.local` (written for you by the seed step):

```env
VITE_FLUX_API_URL=http://localhost:4000
VITE_FLUX_API_KEY=flux_…
```

---

## Handy commands

```bash
cd server && npm start           # API + alert worker
cd server && npm run dev         # same, with --watch
cd server && npm run seed        # (re)seed sites — needs a persistent MongoDB
cd server && npm run seed -- --threshold 600 --phone +919876543210
cd server && npm run burst       # trip the threshold on the first site
cd server && npm run burst -- --site checkout.mystore.in --posts 8
cd client && npm run dev         # dashboard on :5173
cd client && npm run build       # production bundle
cd client && npm run lint        # oxlint
cd agent  && npm run example     # instrumented example site on :3000
```

---

## Scope

This is an MVP, deliberately. **In:** one counter metric, per-site API keys,
threshold alerting with cooldown, SMS, a live dashboard. **Out:** user accounts,
log tailing, load-balancer integration, multi-metric dashboards, clustering.

The API key is a per-site secret held by both the agent and the dashboard — fine
for something you self-host on your own machine or a small VPS, not a public
multi-tenant service.
