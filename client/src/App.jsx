import React, { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

import { fetchSites, fetchMetrics } from "./api.js";

// --- live data settings -----------------------------------------------

const POLL_MS = 2000;
const WINDOW = "2m";
// One plotted point per 4s, matching the server's alert window.
const BUCKET = 4;

function fmtClock(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-IN", { hour12: false, minute: "2-digit", second: "2-digit" });
}

// --- small presentational pieces --------------------------------------

function StatCard({ label, value, unit, tone }) {
  const toneMap = {
    normal: "text-[#E8A33D]",
    good: "text-[#4FD1C5]",
    bad: "text-[#E5647A]",
  };
  return (
    <div className="bg-[#161C22] border border-[#232B33] rounded-md px-5 py-4 flex flex-col gap-1">
      <span className="text-[11px] tracking-wide text-[#7B8794]">{label}</span>
      <span className={`font-mono text-2xl ${toneMap[tone] || toneMap.normal}`}>
        {value}
        {unit && <span className="text-sm text-[#7B8794] ml-1">{unit}</span>}
      </span>
    </div>
  );
}

function AlertRow({ site, time, count }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#232B33] last:border-0">
      <div className="flex flex-col">
        <span className="text-sm text-[#E8EAED]">{site}</span>
        <span className="text-xs text-[#7B8794] font-mono">{time}</span>
      </div>
      <span className="text-xs font-mono text-[#E5647A] bg-[#E5647A1A] px-2 py-1 rounded">
        {count} req/window
      </span>
    </div>
  );
}

// --- main dashboard -----------------------------------------------------

export default function FluxDashboard() {
  const [sites, setSites] = useState([]);
  const [activeSite, setActiveSite] = useState(null);
  const [series, setSeries] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ current: 0, average: 0, peak: 0 });
  const [threshold, setThreshold] = useState(0);
  const [alertWindow, setAlertWindow] = useState(60);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);

  // Which sites is this Flux server watching?
  useEffect(() => {
    fetchSites()
      .then((data) => {
        setSites(data.sites);
        setActiveSite((current) => current ?? data.sites[0]?.id ?? null);
        setError(null);
      })
      .catch((err) => setError(err.message));
  }, []);

  // Poll the ingestion API instead of generating traffic locally.
  useEffect(() => {
    if (!activeSite) return undefined;

    const load = async () => {
      try {
        const data = await fetchMetrics(activeSite, WINDOW, BUCKET);
        setSeries(data.points.map((p) => ({ t: p.timestamp * 1000, reqs: p.request_count })));
        setStats(data.stats);
        setThreshold(data.site.alert_threshold);
        setAlertWindow(data.alert_window_seconds);
        setAlerts(
          data.alerts.slice(0, 6).map((a) => ({
            site: a.site_id,
            time: fmtClock(a.fired_at * 1000),
            count: a.request_count,
          }))
        );
        setError(null);
      } catch (err) {
        setError(err.message);
      }
    };

    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [activeSite]);

  const { current, average: avg, peak } = stats;

  return (
    <div className="min-h-screen bg-[#0F1418] text-[#E8EAED] flex font-sans">
      {/* sidebar */}
      <aside className="w-56 border-r border-[#232B33] flex flex-col py-6 px-4 shrink-0">
        <div className="flex items-baseline gap-1 mb-8 px-1">
          <span className="text-lg font-semibold">Flux</span>
          <span className="text-[10px] text-[#7B8794] font-mono">v0.1</span>
        </div>
        <span className="text-[11px] text-[#7B8794] px-1 mb-2">Monitored sites</span>
        <nav className="flex flex-col gap-1">
          {sites.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSite(s.id)}
              className={`text-left text-sm px-3 py-2 rounded-md transition-colors ${
                activeSite === s.id
                  ? "bg-[#1E2731] text-[#E8A33D]"
                  : "text-[#9AA5B1] hover:bg-[#161C22]"
              }`}
            >
              {s.name}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-1 pt-6 border-t border-[#232B33]">
          <span className="text-[11px] text-[#7B8794]">Alert threshold</span>
          <p className="font-mono text-sm text-[#E8EAED] mt-1">
            {threshold} req / {alertWindow}s window
          </p>
        </div>
      </aside>

      {/* main */}
      <main className="flex-1 px-8 py-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg text-[#E8EAED]">{activeSite ?? "no sites registered"}</h1>
            <p className="text-xs text-[#7B8794] mt-0.5">
              Live request volume, refreshed every {POLL_MS / 1000}s
            </p>
          </div>
          <div
            className={`flex items-center gap-2 text-xs ${
              error ? "text-[#E5647A]" : "text-[#4FD1C5]"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                error ? "bg-[#E5647A]" : "bg-[#4FD1C5] animate-pulse"
              }`}
            />
            {error ? "disconnected" : "connected"}
          </div>
        </div>

        {error && (
          <div className="bg-[#E5647A1A] border border-[#E5647A] rounded-md px-4 py-3 mb-6">
            <p className="text-xs text-[#E5647A]">
              Could not reach the ingestion API: {error}. Is the server running on port 4000, and
              does client/.env.local hold a valid API key?
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard
            label="Current"
            value={current}
            unit="req"
            tone={current > threshold && threshold > 0 ? "bad" : "normal"}
          />
          <StatCard label="Rolling average" value={avg} unit="req" tone="good" />
          <StatCard label="Peak (last 2 min)" value={peak} unit="req" tone="normal" />
        </div>

        <div className="bg-[#161C22] border border-[#232B33] rounded-md p-5 mb-6">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ top: 4, right: 12, left: -12, bottom: 0 }}>
              <CartesianGrid stroke="#232B33" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={fmtClock}
                stroke="#7B8794"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#232B33" }}
              />
              <YAxis
                // Always leave room for the threshold line, so it stays on the
                // chart even while traffic is comfortably below it.
                domain={[0, (max) => Math.ceil(Math.max(max, threshold) * 1.1)]}
                stroke="#7B8794"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: "#232B33" }}
              />
              <Tooltip
                contentStyle={{ background: "#1E2731", border: "1px solid #232B33", borderRadius: 6, fontSize: 12 }}
                labelFormatter={fmtClock}
              />
              <ReferenceLine y={threshold} stroke="#E5647A" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="reqs"
                stroke="#E8A33D"
                strokeWidth={2}
                dot={false}
                // The series arrives from the API after first paint and is
                // replaced every poll; animating each swap just makes it crawl.
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
          {series.length === 0 && !error && (
            <p className="text-xs text-[#7B8794] text-center -mt-32 mb-28">
              No traffic in the last 2 minutes — start the agent or run npm run burst.
            </p>
          )}
        </div>

        <div className="bg-[#161C22] border border-[#232B33] rounded-md p-5">
          <h2 className="text-sm text-[#E8EAED] mb-1">Recent alerts</h2>
          <p className="text-xs text-[#7B8794] mb-3">Sent by SMS to the registered developer</p>
          {alerts.length === 0 ? (
            <p className="text-sm text-[#7B8794] py-4">No alerts yet — traffic is under threshold.</p>
          ) : (
            alerts.map((a, i) => <AlertRow key={i} {...a} />)
          )}
        </div>
      </main>
    </div>
  );
}
