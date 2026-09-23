import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { SITE_ID, fetchMetrics, updateSite } from './api.js';

const POLL_MS = 5000;
const WINDOWS = [
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
];

const fmtClock = (unixSeconds) =>
  new Date(unixSeconds * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

function StatCard({ label, value, hint, accent = 'text-slate-100' }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-semibold tabular-nums ${accent}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400">{fmtClock(label)}</p>
      <p className="mt-1 font-semibold text-slate-100">
        {payload[0].value} requests
      </p>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [window_, setWindow] = useState('15m');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ alert_threshold: '', phone_number: '' });

  const load = useCallback(async () => {
    try {
      const next = await fetchMetrics(SITE_ID, window_);
      setData(next);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err.message);
    }
  }, [window_]);

  // Poll the ingestion API instead of simulating traffic locally.
  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  // Seed the settings form once the site config arrives.
  useEffect(() => {
    if (!data?.site) return;
    setDraft((d) =>
      d.alert_threshold === ''
        ? {
            alert_threshold: String(data.site.alert_threshold),
            phone_number: data.site.phone_number ?? '',
          }
        : d
    );
  }, [data?.site]);

  const series = useMemo(
    () => (data?.points ?? []).map((p) => ({ t: p.timestamp, v: p.request_count })),
    [data]
  );

  const threshold = data?.site?.alert_threshold ?? 0;
  const stats = data?.stats ?? { current: 0, average: 0, peak: 0, total: 0 };
  const alerts = data?.alerts ?? [];
  const breaching = stats.current > threshold && threshold > 0;

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await updateSite(SITE_ID, {
        alert_threshold: Number(draft.alert_threshold),
        phone_number: draft.phone_number.trim() || null,
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* ─────────────────────────────── header */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-500/15 text-lg">
                ⚡
              </span>
              <h1 className="text-2xl font-semibold tracking-tight">Flux</h1>
              <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                {data?.site?.name ?? SITE_ID}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Lightweight traffic monitoring and SMS alerting for small teams.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-lg border border-slate-800">
              {WINDOWS.map((w) => (
                <button
                  key={w.value}
                  onClick={() => setWindow(w.value)}
                  className={`px-3 py-1.5 text-xs font-medium transition ${
                    window_ === w.value
                      ? 'bg-slate-800 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                error
                  ? 'border-rose-800 bg-rose-500/10 text-rose-300'
                  : 'border-emerald-800 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  error ? 'bg-rose-400' : 'animate-pulse bg-emerald-400'
                }`}
              />
              {error ? 'disconnected' : 'live'}
            </span>
          </div>
        </header>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-900 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            Could not reach the ingestion API: {error}. Is the server running on
            port 4000, and is client/.env.local pointing at the right site?
          </p>
        )}

        {/* ─────────────────────────────── stat cards */}
        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Current traffic"
            value={stats.current}
            hint={`requests per ${data?.bucket_seconds ?? 15}s bucket`}
            accent={breaching ? 'text-rose-400' : 'text-emerald-400'}
          />
          <StatCard
            label="Average traffic"
            value={stats.average}
            hint={`over the last ${window_}`}
          />
          <StatCard
            label="Peak traffic"
            value={stats.peak}
            hint={`threshold ${threshold}`}
            accent={stats.peak > threshold ? 'text-amber-400' : 'text-slate-100'}
          />
        </section>

        {/* ─────────────────────────────── chart */}
        <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Request volume</h2>
            <p className="text-xs text-slate-500">
              {lastUpdated
                ? `updated ${lastUpdated.toLocaleTimeString()}`
                : 'loading…'}
            </p>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <defs>
                  <linearGradient id="fluxFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  // Numeric/time scale so gaps in the data read as real gaps
                  // rather than being squeezed into even categories.
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={fmtClock}
                  stroke="#475569"
                  tick={{ fontSize: 11 }}
                  minTickGap={40}
                />
                <YAxis stroke="#475569" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <ReferenceLine
                  y={threshold}
                  stroke="#fb7185"
                  strokeDasharray="6 4"
                  label={{
                    value: `threshold ${threshold}`,
                    position: 'insideTopRight',
                    fill: '#fb7185',
                    fontSize: 11,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#34d399"
                  strokeWidth={2}
                  fill="url(#fluxFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {series.length === 0 && !error && (
            <p className="mt-3 text-center text-xs text-slate-500">
              No data in this window yet — start the agent or run{' '}
              <code className="text-slate-400">npm run burst</code>.
            </p>
          )}
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* ───────────────────────────── alerts */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">Recent alerts</h2>
              <span className="text-xs text-slate-500">{alerts.length} shown</span>
            </div>

            {alerts.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No alerts fired. Traffic is below the threshold.
              </p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {alerts.map((a) => (
                  <li key={a._id} className="flex items-start gap-3 py-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-200">
                        {a.request_count} requests exceeded the threshold of{' '}
                        {a.threshold}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(a.fired_at * 1000).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        a.sms_status === 'sent'
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : a.sms_status === 'failed'
                            ? 'bg-rose-500/10 text-rose-300'
                            : 'bg-slate-700/40 text-slate-400'
                      }`}
                    >
                      SMS {a.sms_status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ───────────────────────────── settings */}
          <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="text-sm font-semibold text-slate-200">Alert settings</h2>
            <p className="mt-1 text-xs text-slate-500">
              Applies to site <code className="text-slate-400">{SITE_ID}</code>.
            </p>

            <form onSubmit={saveSettings} className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-slate-400">
                  Threshold (requests per alert window)
                </span>
                <input
                  type="number"
                  min="1"
                  value={draft.alert_threshold}
                  onChange={(e) =>
                    setDraft({ ...draft, alert_threshold: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-400">
                  SMS number (E.164)
                </span>
                <input
                  type="tel"
                  placeholder="+919876543210"
                  value={draft.phone_number}
                  onChange={(e) =>
                    setDraft({ ...draft, phone_number: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-600"
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </form>
          </section>
        </div>

        <footer className="mt-10 text-center text-xs text-slate-600">
          Flux · polling every {POLL_MS / 1000}s · SDG-9 mini project
        </footer>
      </div>
    </div>
  );
}
