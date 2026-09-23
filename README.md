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

| Folder    | What it is                                                              |
| --------- | ----------------------------------------------------------------------- |
| `server/` | Express ingestion API, MongoDB (Mongoose) storage, cron alert worker    |
| `client/` | React + Vite + Tailwind + Recharts dashboard                            |
| `agent/`  | `flux-agent` — the tiny drop-in counter a site owner installs           |

---

## Quick start (about two minutes)

You need **Node 18+**. You do *not* need MongoDB installed — see
[Database](#database) below.

```bash
# 1. install everything
npm run install:all          # or: npm install in server/, client/ and agent/

# 2. start the API + alert worker (terminal 1)
cd server && npm start

# 3. start the dashboard (terminal 2)
cd client && npm run dev     # → http://localhost:5173
```

On its first run against an empty database the server **creates a demo site**,
backfills 15 minutes of baseline traffic, prints the API key, and writes
`client/.env.local` so the dashboard connects with no copy-paste:

```
──────────────────────────────────────────────────────────────
  Site id         : demo-site
  API key         : flux_45d877cb43e483998d4fb7c66e48fa71
  Alert threshold : 120 requests per alert window
  Phone number    : (none - SMS will be skipped)
──────────────────────────────────────────────────────────────
```

Open <http://localhost:5173> and you have a live dashboard.

---

## The 5-minute demo

1. **Show the dashboard.** Baseline traffic sits under the dashed threshold line.
2. **Point a "customer site" at Flux** (terminal 3):
   ```bash
   cd agent && npm run example
   ```
   A toy Express app on `:3000` instrumented with `flux-agent`, generating its
   own synthetic visitors. The chart starts moving within ~5 seconds.
3. **Set your phone number.** In the dashboard's *Alert settings* panel, enter an
   E.164 number (`+919876543210`) and save. (With Twilio configured, this is the
   number that will be texted.)
4. **Trip the threshold** (terminal 4):
   ```bash
   cd server && npm run burst
   ```
   Sends ~2× the threshold over 8 seconds.
5. **Watch it fire.** Within 30 seconds the worker logs the breach, the SMS goes
   out, and a row appears in *Recent alerts* with an `SMS sent` badge.
6. **Run `npm run burst` again** — the dashboard keeps climbing but no second SMS
   arrives. That's the 5-minute cooldown doing its job.

---

## Database

`server/.env` sets `MONGODB_URI`. Flux tries it, and falls back automatically:

| Setup                    | What to do                                                        |
| ------------------------ | ----------------------------------------------------------------- |
| **Nothing installed**    | Just run it. Flux starts an **in-memory MongoDB** (data is lost on restart — perfect for a demo). |
| **Local mongod**         | `MONGODB_URI=mongodb://127.0.0.1:27017/flux`                       |
| **MongoDB Atlas (free)** | `MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/flux`     |

Set `USE_MEMORY_DB=true` to force the in-memory database even when a real one is
reachable.

> **Demo gotcha:** with the in-memory database, restarting the server wipes it,
> so a **new API key is minted** and `client/.env.local` is rewritten. Vite bakes
> env vars in at startup, so restart `client` (and the agent) after restarting
> the server, or the dashboard will sit there showing `disconnected` / `401`.
> Point `MONGODB_URI` at a real MongoDB if you want the key to stay put.

### Collections

**`sites`**

| Field             | Type   | Notes                                    |
| ----------------- | ------ | ---------------------------------------- |
| `_id`             | string | Human-friendly id, e.g. `demo-site`      |
| `name`            | string |                                          |
| `api_key`         | string | `flux_…`, unique, minted on creation     |
| `alert_threshold` | number | Requests per alert window                |
| `phone_number`    | string | E.164, or `null` to skip SMS             |

**`metrics`** — `site_id`, `timestamp` (unix seconds), `request_count`

**`alerts`** — `site_id`, `fired_at`, `request_count`, `threshold`, `message`,
`sms_status` (`sent` / `failed` / `skipped`)

---

## API

Every endpoint except site creation needs the site's API key:

```
Authorization: Bearer flux_45d877cb…
```
(or `x-api-key: flux_45d877cb…`)

### `POST /api/metrics`

```bash
curl -X POST http://localhost:4000/api/metrics \
  -H "Authorization: Bearer $FLUX_API_KEY" \
  -H "content-type: application/json" \
  -d '{"site_id":"demo-site","timestamp":1790059570,"request_count":42}'
```

`timestamp` is optional (defaults to now) and accepts unix seconds, unix millis
or an ISO string. Timestamps more than 5 minutes in the future are rejected —
one bad clock would otherwise stretch every chart's time axis out to meet it.
The key must belong to `site_id` — otherwise `403`.

### `GET /api/sites/:site_id/metrics?window=15m`

Everything the dashboard needs in one poll: the bucketed series, summary stats,
and recent alerts. `window` accepts `90s`, `15m`, `2h`, `1d` (10s–7d).

```json
{
  "site": { "id": "demo-site", "name": "Demo Site", "alert_threshold": 120 },
  "window_seconds": 900,
  "bucket_seconds": 15,
  "points": [{ "timestamp": 1790059305, "request_count": 44 }],
  "stats": { "current": 44, "average": 56, "peak": 210, "total": 1059 },
  "alerts": []
}
```

Buckets are sized to return roughly 60 points however chatty the agents are.

### Other endpoints

| Endpoint                            | Purpose                                       |
| ----------------------------------- | --------------------------------------------- |
| `POST /api/sites`                   | Register a site, returns the API key **once** |
| `GET /api/sites`                    | List sites (secrets stripped)                 |
| `GET /api/sites/:id`                | One site's config                             |
| `PATCH /api/sites/:id`              | Change threshold / phone / name               |
| `GET /api/sites/:id/alerts?limit=25`| Alert history                                 |
| `GET /api/health`                   | Site count, Twilio mode, uptime               |

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
  siteId: 'corner-shop',
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

Either edit them in the dashboard's *Alert settings* panel, or:

```bash
curl -X PATCH http://localhost:4000/api/sites/demo-site \
  -H "Authorization: Bearer $FLUX_API_KEY" \
  -H "content-type: application/json" \
  -d '{"alert_threshold":300,"phone_number":"+919876543210"}'
```

Phone numbers must be **E.164** (`+` and country code). A site with no phone
number still records alerts — the SMS is marked `skipped`.

### How the worker decides

Every `ALERT_CRON` tick (default: 30s) it sums each site's `request_count` over
the trailing `ALERT_WINDOW_SECONDS` (default: 60s) and compares that to
`alert_threshold`. On a breach it sends the SMS and writes an `alerts` row.

`ALERT_COOLDOWN_SECONDS` (default: 300) caps it at one alert per site per five
minutes, however long the spike lasts — a sustained breach is one text, not
forty. Suppressed checks are logged:

```
[alerting] demo-site still breaching (237 > 120) but in cooldown for another 290s
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

| Variable                 | Default                     | Meaning                                    |
| ------------------------ | --------------------------- | ------------------------------------------ |
| `PORT`                   | `4000`                      | API port                                   |
| `MONGODB_URI`            | `mongodb://127.0.0.1:27017/flux` | Falls back to in-memory if unreachable |
| `USE_MEMORY_DB`          | `false`                     | Force the in-memory database               |
| `ALERT_CRON`             | `*/30 * * * * *`            | How often sites are evaluated              |
| `ALERT_WINDOW_SECONDS`   | `60`                        | Rolling window compared to the threshold   |
| `ALERT_COOLDOWN_SECONDS` | `300`                       | Minimum gap between alerts for one site    |
| `TWILIO_*`               | *(empty)*                   | Empty ⇒ dry-run mode                       |
| `ADMIN_TOKEN`            | *(empty)*                   | Empty ⇒ `POST /api/sites` is open          |
| `AUTOSEED`               | `true`                      | Create the demo site on an empty database  |
| `DEMO_PHONE_NUMBER`      | *(empty)*                   | Default number for the seeded site         |

The dashboard reads `client/.env.local` (written for you by the seed step):

```env
VITE_FLUX_API_URL=http://localhost:4000
VITE_FLUX_SITE_ID=demo-site
VITE_FLUX_API_KEY=flux_…
```

---

## Handy commands

```bash
cd server && npm start           # API + alert worker
cd server && npm run dev         # same, with --watch
cd server && npm run seed        # (re)seed a site — needs a persistent MongoDB
cd server && npm run seed -- --id shop --name "Shop" --threshold 200 --phone +919876543210
cd server && npm run burst       # fire ~2x the threshold
cd server && npm run burst -- --count 500 --posts 10
cd client && npm run dev         # dashboard on :5173
cd client && npm run build       # production bundle
cd agent  && npm run example     # instrumented example site on :3000
```

---

## Scope

This is an MVP, deliberately. **In:** one counter metric, per-site API keys,
threshold alerting with cooldown, SMS, a live dashboard. **Out:** user accounts,
log tailing, load-balancer integration, multi-metric dashboards, clustering.

The API key is a per-site read/write secret held by both the agent and the
dashboard — fine for something you self-host on your own machine or a small VPS,
not a public multi-tenant service.
