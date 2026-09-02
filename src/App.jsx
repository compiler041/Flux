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

// --- mock data engine -------------------------------------------------

const SITES = ["api.mystore.in", "checkout.mystore.in", "cdn.mystore.in"];
const THRESHOLD = 480;

function seedSeries() {
  const now = Date.now();
  const points = [];
  let val = 220;
  for (let i = 29; i >= 0; i--) {
    val = Math.max(60, val + (Math.random() - 0.5) * 60);
    points.push({ t: now - i * 4000, reqs: Math.round(val) });
  }
  return points;
}

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
  const [activeSite, setActiveSite] = useState(SITES[0]);
  const [series, setSeries] = useState(seedSeries);
  const [alerts, setAlerts] = useState([
    { site: "checkout.mystore.in", time: "12:41:08", count: 512 },
  ]);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSeries((prev) => {
        const last = prev[prev.length - 1].reqs;
        const next = Math.max(50, last + (Math.random() - 0.45) * 70);
        const point = { t: Date.now(), reqs: Math.round(next) };
        const updated = [...prev.slice(1), point];

        if (point.reqs > THRESHOLD) {
          setAlerts((a) =>
            [{ site: activeSite, time: fmtClock(point.t), count: point.reqs }, ...a].slice(0, 6)
          );
        }
        return updated;
      });
    }, 2200);
    return () => clearInterval(timerRef.current);
  }, [activeSite]);

  const current = series[series.length - 1].reqs;
  const avg = Math.round(series.reduce((s, p) => s + p.reqs, 0) / series.length);
  const peak = Math.max(...series.map((p) => p.reqs));

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
          {SITES.map((s) => (
            <button
              key={s}
              onClick={() => setActiveSite(s)}
              className={`text-left text-sm px-3 py-2 rounded-md transition-colors ${
                activeSite === s
                  ? "bg-[#1E2731] text-[#E8A33D]"
                  : "text-[#9AA5B1] hover:bg-[#161C22]"
              }`}
            >
              {s}
            </button>
          ))}
        </nav>
        <div className="mt-auto px-1 pt-6 border-t border-[#232B33]">
          <span className="text-[11px] text-[#7B8794]">Alert threshold</span>
          <p className="font-mono text-sm text-[#E8EAED] mt-1">{THRESHOLD} req / 4s window</p>
        </div>
      </aside>

      {/* main */}
      <main className="flex-1 px-8 py-6 overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg text-[#E8EAED]">{activeSite}</h1>
            <p className="text-xs text-[#7B8794] mt-0.5">Live request volume, refreshed every 2s</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#4FD1C5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FD1C5] animate-pulse" />
            connected
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="Current" value={current} unit="req" tone={current > THRESHOLD ? "bad" : "normal"} />
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
              <YAxis stroke="#7B8794" fontSize={11} tickLine={false} axisLine={{ stroke: "#232B33" }} />
              <Tooltip
                contentStyle={{ background: "#1E2731", border: "1px solid #232B33", borderRadius: 6, fontSize: 12 }}
                labelFormatter={fmtClock}
              />
              <ReferenceLine y={THRESHOLD} stroke="#E5647A" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="reqs" stroke="#E8A33D" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
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
