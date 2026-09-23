# Flux — demo script

Everything here is copy-paste for **Windows PowerShell**. Use `curl.exe`, never
`curl` — PowerShell aliases `curl` to something else and it will fail.

Two demos:

- **[A] Local demo** — the three seeded sites, no internet needed.
- **[B] Your real site** — register a live URL and drive real HTTP traffic at it.

Do A first. B builds on it.

---

## Before you start (once)

```powershell
cd "C:\Users\Vaibhav Rathod\Desktop\FLUX"; npm run install:all
```

Optional, for a **real SMS**: add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and
`TWILIO_FROM_NUMBER` to `server\.env`, and verify your own number in the Twilio
console (trial accounts can only text verified numbers). Without them Flux runs
in **dry-run**: the message is printed to the server terminal instead of sent.
Everything else behaves identically.

You want **3 PowerShell tabs**. Start the server first — it mints the API keys
and writes them into `client\.env.local` for the dashboard.

---

# [A] Local demo

### A1 · Terminal 1 — the server

```powershell
cd "C:\Users\Vaibhav Rathod\Desktop\FLUX\server"; npm start
```

Point out in the banner:

- three sites with their API keys and threshold `480`
- `[db] falling back to an in-memory MongoDB` — nothing to install
- `[db] inspect it with: mongosh "mongodb://127.0.0.1:PORT/flux"` — keep this for A6
- `[alerting] worker started (cron "*/4 * * * * *", window 4s, cooldown 300s)`

### A2 · Terminal 2 — the dashboard

```powershell
cd "C:\Users\Vaibhav Rathod\Desktop\FLUX\client"; npm run dev
```

Open <http://localhost:5173>. Three sites in the sidebar, ~220 req per 4s, under
the dashed 480 line, green **connected**. Click between sites — each has its own
series and its own threshold.

### A3 · Terminal 3 — a site being monitored

```powershell
cd "C:\Users\Vaibhav Rathod\Desktop\FLUX\agent"; npm run example
```

A real Express app on `:3000` with **one line added** — `app.use(fluxAgent({…}))`.
Show `agent\example-site.js`, then watch the chart move within ~5 seconds.

### A4 · Set the alert number

```powershell
cd "C:\Users\Vaibhav Rathod\Desktop\FLUX"; $KEY = (Select-String -Path "client\.env.local" -Pattern "VITE_FLUX_API_KEY=(.*)").Matches.Groups[1].Value; curl.exe -s -X PATCH http://localhost:4000/api/sites/api.mystore.in -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{\"phone_number\":\"+91XXXXXXXXXX\"}'
```

### A5 · Trip the threshold

```powershell
cd "C:\Users\Vaibhav Rathod\Desktop\FLUX\server"; npm run burst
```

Within ~4 seconds, three things happen together:

1. **Terminal 1** — `DRY RUN → SMS to +91…: traffic spike: 2901 requests in the last 4s (threshold 480)`
2. **Chart** — the line punches through the dashed threshold, `Current` turns red
3. **Recent alerts** — a new row with the count and time

**Now run it again.** Traffic climbs, but no second SMS:

```
[alerting] api.mystore.in still breaching (1466 > 480) but in cooldown for another 296s
```

One incident, one text. This is the bit worth dwelling on — it's the difference
between an alerting tool and a spam machine.

Target a different site instead:

```powershell
npm run burst -- --site checkout.mystore.in
```

### A6 · Show the data (optional)

Open **MongoDB Compass**, paste the `mongodb://127.0.0.1:PORT/flux` URI from A1.
Three collections: `sites`, `metrics` (one row per agent flush), `alerts` (one
row per fired alert, with `sms_status`).

---

# [B] Your real AWS site

This needs **no code change and no AWS access**. A probe runs on your laptop,
sends real HTTP requests to your public URL, and reports how many it made. It
works whatever the site is built with — Node, Python, PHP, static, anything that
answers HTTP.

> **Say this out loud during the demo:** *"This is a synthetic load probe — it
> counts the requests it sends. In production the counter lives inside the
> application, so every real visitor is counted at the source."* It's the honest
> framing and it pre-empts the obvious question.

### B0 · Check what you're pointing at

```powershell
curl.exe -sI https://your-aws-site.com
```

You want `HTTP/… 200`. This also tells you what's serving it (`Server:` header),
which is worth knowing for the in-app integration later.

### B1 · Register the site and capture its key

Set the three variables, then run it as one line:

```powershell
cd "C:\Users\Vaibhav Rathod\Desktop\FLUX"; $SITE="myshop.in"; $PHONE="+919812345678"; $r = curl.exe -s -X POST http://localhost:4000/api/sites -H "content-type: application/json" -d "{\`"id\`":\`"$SITE\`",\`"name\`":\`"$SITE\`",\`"alert_threshold\`":60,\`"phone_number\`":\`"$PHONE\`"}" | ConvertFrom-Json; $KEY = $r.api_key; $KEY
```

`$SITE` is just a label — use your domain. The site appears in the dashboard
sidebar within ~2 seconds. `$KEY` stays set in this terminal for the next steps.

> The API key is returned **once**. If you lose it, register under a new id.

### B2 · Probe gently — prove the site answers

```powershell
node agent\probe.js --url https://your-aws-site.com --site $SITE --key $KEY --rps 5 --seconds 20
```

You want `[200:100]` in the output. If you see failures or `403`/`404`, fix the
URL before going further — include the scheme (`https://`) and the exact path.

### B3 · Cross the threshold

A bucket is 4 seconds, so the rule is **`rps × 4` must exceed the threshold**.
With `alert_threshold: 60` you need 16 or more:

```powershell
node agent\probe.js --url https://your-aws-site.com --site $SITE --key $KEY --rps 20 --seconds 30
```

Click your site in the sidebar and watch it cross the line, exactly as in A5.

Threshold wrong for your site? Change it without re-registering:

```powershell
curl.exe -s -X PATCH "http://localhost:4000/api/sites/$SITE" -H "Authorization: Bearer $KEY" -H "content-type: application/json" -d '{\"alert_threshold\":200}'
```

Rule of thumb: set it to about `4 × (your site's normal requests per second)`.

> ⚠️ `--rps` is **real load against your own infrastructure**. Start at 5 and
> work up. On a `t2.micro`, a few hundred rps is enough to make the site
> genuinely unwell. Only ever point this at a site you own.

---

## Counting real visitors (the production path)

The probe is a stand-in. To count actual visitors, `flux-agent` runs *inside*
the application, and Flux has to be reachable from AWS:

- **Quick:** `ngrok http 4000` on your laptop, set the agent's `url` to the
  ngrok URL. Minutes to set up, dies when you close the terminal.
- **Properly:** run Flux on a small EC2 instance in the same VPC
  (`pm2 start src/index.js`), `MONGODB_URI` pointed at MongoDB Atlas, agents
  posting to its private IP, security group allowing 4000 only from the app's
  security group.

For an Express app that is one line:

```js
app.use(fluxAgent({
  url: process.env.FLUX_URL,
  siteId: process.env.FLUX_SITE_ID,
  apiKey: process.env.FLUX_API_KEY,
  intervalSeconds: 4,
}));
```

Other stacks need the same ~30 lines: count requests in memory, POST the total
every few seconds.

---

## If something breaks

| Symptom | Cause | Fix |
| --- | --- | --- |
| Dashboard shows **disconnected** / 401 | Server restarted and minted new keys; Vite baked the old one at startup | Restart Terminal 2 |
| `curl : The term …` | PowerShell aliased `curl` to `Invoke-WebRequest` | Use `curl.exe` |
| `EADDRINUSE` on 4000 or 5173 | Old process still holding the port | `Get-NetTCPConnection -LocalPort 4000 -State Listen \| %{ Stop-Process -Id $_.OwningProcess -Force }` |
| Alert never fires | Threshold too high for the load, or no phone set | `rps × 4` must beat the threshold; re-run A4 / B1 |
| `409 site already exists` | That id is registered | Use a different `$SITE`, or `PATCH` the existing one |
| Probe reports `failed` | Wrong URL, DNS, or TLS | Re-check with `curl.exe -sI <url>` |

## Known limits — be ready for these questions

- **It measures request count only.** No CPU, memory or disk, so it cannot tell
  you when a machine is about to run out of capacity, and it does no
  forecasting. Host metrics are the natural next step.
- **Empty buckets are omitted, not zero-filled.** A site dropping to zero
  traffic currently draws a flat line rather than falling to zero.
- **In-memory MongoDB loses everything on restart**, including API keys. Point
  `MONGODB_URI` at a real database for anything you want to keep.
