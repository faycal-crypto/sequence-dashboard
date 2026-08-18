"use client";

import { useEffect, useMemo, useState } from "react";

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const num = (n) => (n ?? 0).toLocaleString("en-US");

// Bounce-rate status bands:
// <5% green · 5–6% orange · 6–8% light red · >8% dark red
function bounceColor(rate) {
  if (rate < 0.05) return "var(--b-green)";
  if (rate < 0.06) return "var(--b-orange)";
  if (rate <= 0.08) return "var(--b-lred)";
  return "var(--b-dred)";
}
// dark ink on the lighter bands, white only on dark red
function cellInk(rate) {
  return rate > 0.08 ? "#fff" : "#0b0b0b";
}

const fmt = (d) => d.toISOString().slice(0, 10);
function presetRange(kind) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (kind === "month") return { start: fmt(new Date(Date.UTC(y, m, 1))), end: fmt(now) };
  if (kind === "30d") {
    const s = new Date(now);
    s.setUTCDate(s.getUTCDate() - 29);
    return { start: fmt(s), end: fmt(now) };
  }
  if (kind === "lastmonth")
    return {
      start: fmt(new Date(Date.UTC(y, m - 1, 1))),
      end: fmt(new Date(Date.UTC(y, m, 0))),
    };
  return null;
}

function BarList({ rows, emptyLabel }) {
  const max = Math.max(0.0001, ...rows.map((r) => r.bounceRate));
  if (!rows.length) return <p className="sub">{emptyLabel}</p>;
  return (
    <div>
      {rows.map((r) => (
        <div className="bar-row" key={r.id || r.ownerId || r.name}
             title={r.noData ? `${r.name}: no enrollment yet` : `${r.name}: ${r.bounced} bounced / ${r.sent} sent`}>
          <span className={"bar-name" + (r.noData ? " dim" : "")}>{r.name}</span>
          <span className="bar-track">
            {!r.noData && (
              <span className="bar-fill" style={{ width: `${(r.bounceRate / max) * 100}%`, background: bounceColor(r.bounceRate) }} />
            )}
          </span>
          <span className="bar-val">
            {r.noData ? (
              <span className="none">no enrollment</span>
            ) : (
              <>
                {pct(r.bounceRate)} <span className="muted">({r.bounced}/{r.sent})</span>
              </>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seqFilter, setSeqFilter] = useState("all");
  const [sdrFilter, setSdrFilter] = useState("all");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [range, setRange] = useState({ start: "", end: "" });
  const [preset, setPreset] = useState("month");
  const [theme, setTheme] = useState("system");

  // theme init + apply
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("theme") : null;
    if (saved) setTheme(saved);
  }, []);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === "system") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", theme);
    if (typeof window !== "undefined") {
      if (theme === "system") window.localStorage.removeItem("theme");
      else window.localStorage.setItem("theme", theme);
    }
  }, [theme]);
  function toggleTheme() {
    const isDark =
      theme === "dark" ||
      (theme === "system" && typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(isDark ? "light" : "dark");
  }

  async function load(fresh, r) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (fresh) params.set("fresh", "1");
      if (r?.start && r?.end) {
        params.set("start", r.start);
        params.set("end", r.end);
      }
      const qs = params.toString();
      const res = await fetch(`/api/metrics${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setData(json);
      if (json.window && !range.start) setRange(json.window);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false, null); }, []);

  function applyPreset(kind) {
    setPreset(kind);
    const r = presetRange(kind);
    if (r) { setRange(r); load(true, r); }
  }
  function applyCustom() {
    setPreset("custom");
    if (range.start && range.end) load(true, range);
  }

  const contacts = useMemo(() => {
    if (!data?.bouncedContacts) return [];
    return data.bouncedContacts.filter((c) => {
      if (seqFilter !== "all" && String(c.sequenceId) !== seqFilter) return false;
      if (sdrFilter !== "all" && c.sdr !== sdrFilter) return false;
      if (onlyFlagged && !c.reviewFlag) return false;
      return true;
    });
  }, [data, seqFilter, sdrFilter, onlyFlagged]);

  const sdrNames = useMemo(() => (data?.perSdr || []).map((s) => s.name), [data]);
  const seqCols = useMemo(() => data?.configuredSequences || [], [data]);
  const matrixLookup = useMemo(() => {
    const m = new Map();
    for (const c of data?.matrix || []) m.set(`${c.sdr}|${c.sequenceId}`, c);
    return m;
  }, [data]);

  return (
    <div className="wrap">
      <div className="head">
        <div>
          <h1>RevOps Bounce Rate Dashboard</h1>
          <div className="sub">
            {data?.window ? `${data.window.start} → ${data.window.end}` : "…"}
            {data?.generatedAt && ` · updated ${new Date(data.generatedAt).toLocaleString()}`}
            {data?.cached && " · cached"}
          </div>
        </div>
        <div className="controls">
          <button className="ghost" onClick={toggleTheme} title="Toggle light / dark">
            {theme === "dark" ? "☀️ Light" : theme === "light" ? "🌙 Dark" : "🌓 Theme"}
          </button>
          <button className="primary" onClick={() => load(true, range.start ? range : null)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* date range */}
      <div className="card" style={{ marginTop: 14, paddingTop: 14, paddingBottom: 14 }}>
        <div className="controls">
          <button className={"preset" + (preset === "month" ? " active" : "")} onClick={() => applyPreset("month")}>Ce mois-ci</button>
          <button className={"preset" + (preset === "30d" ? " active" : "")} onClick={() => applyPreset("30d")}>30 derniers jours</button>
          <button className={"preset" + (preset === "lastmonth" ? " active" : "")} onClick={() => applyPreset("lastmonth")}>Mois dernier</button>
          <span className="datefld">
            Du <input type="date" value={range.start || ""} onChange={(e) => setRange({ ...range, start: e.target.value })} />
            au <input type="date" value={range.end || ""} onChange={(e) => setRange({ ...range, end: e.target.value })} />
          </span>
          <button onClick={applyCustom} disabled={loading || !range.start || !range.end}>Appliquer</button>
        </div>
      </div>

      {error && (
        <div className="err">
          <strong>Couldn’t load data.</strong> {error}
          <div className="sub" style={{ marginTop: 8 }}>
            Check that <code>HUBSPOT_TOKEN</code> is set with scope <code>sales-email-read</code>.
          </div>
        </div>
      )}

      {data?.unconfigured && (
        <div className="notice">
          <strong>No sequence IDs configured yet.</strong> Add the sequence IDs in <code>lib/sequences.js</code> — see{" "}
          <a href="/api/sequences" target="_blank" rel="noreferrer">/api/sequences</a>.
        </div>
      )}

      {loading && !data && <div className="spin">Loading…</div>}

      {data && !data.unconfigured && (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="label">Emails sent</div>
              <div className="value">{num(data.totals.sent)}</div>
              <div className="foot">across {data.perSequence.length} sequences</div>
            </div>
            <div className="kpi">
              <div className="label">Bounced</div>
              <div className="value">{num(data.totals.bounced)}</div>
              <div className="foot">{data.totals.bouncedContacts} unique contacts</div>
            </div>
            <div className="kpi">
              <div className="label">Bounce rate</div>
              <div className="value" style={{ color: bounceColor(data.totals.bounceRate) }}>{pct(data.totals.bounceRate)}</div>
              <div className="foot">bounced / attempted</div>
            </div>
            <div className="kpi">
              <div className="label">Adjusted bounce rate</div>
              <div className="value" style={{ color: bounceColor(data.adjusted.bounceRate) }}>{pct(data.adjusted.bounceRate)}</div>
              <div className="foot">excl. legit-email = NO</div>
            </div>
            <div className="kpi">
              <div className="label">⚑ Legit-email bounces</div>
              <div className="value">{num(data.totals.legitEmailBounces)}</div>
              <div className="foot">bounced but “SDR Legit Email” = YES</div>
            </div>
          </div>

          <div className="grid2">
            <div className="card">
              <h2>Bounce rate per sequence</h2>
              <BarList rows={data.perSequence} emptyLabel="No sequence emails in window." />
            </div>
            <div className="card">
              <h2>Bounce rate per SDR</h2>
              <BarList rows={data.perSdr} emptyLabel="No SDR sends in window." />
            </div>
          </div>

          {/* Adjusted report */}
          <div className="card">
            <h2>Adjusted bounce rate — excluding “SDR Legit Email = NO”</h2>
            <div className="recalc-hero">
              <span className="big" style={{ color: bounceColor(data.adjusted.bounceRate) }}>{pct(data.adjusted.bounceRate)}</span>
              <span className="sub" style={{ marginTop: 0 }}>
                overall · {num(data.adjusted.bounced)} bounces counted ({num(data.adjusted.excludedBounces)} excluded as known-bad addresses) / {num(data.adjusted.sent)} sent
              </span>
            </div>
            <BarList rows={data.adjusted.perSdr} emptyLabel="No SDR sends in window." />
          </div>

          <div className="card">
            <h2>Bounce rate — SDR × sequence</h2>
            <div className="tablescroll">
              <table className="heat">
                <thead>
                  <tr>
                    <th>SDR</th>
                    {seqCols.map((s) => (
                      <th className="rot num" key={s.id} title={s.name}>{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sdrNames.map((sdr) => (
                    <tr key={sdr}>
                      <td>{sdr}</td>
                      {seqCols.map((s) => {
                        const cell = matrixLookup.get(`${sdr}|${s.id}`);
                        const has = !!cell && cell.sent > 0;
                        return (
                          <td key={s.id}>
                            {has ? (
                              <div className="cell" style={{ background: bounceColor(cell.bounceRate), color: cellInk(cell.bounceRate) }}
                                   title={`${cell.bounced}/${cell.sent}`}>
                                {pct(cell.bounceRate)}
                                <div style={{ fontSize: 10, opacity: 0.85 }}>{cell.bounced}/{cell.sent}</div>
                              </div>
                            ) : (
                              <span style={{ color: "var(--muted)" }}>—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="legend">
              <span><span className="swatch" style={{ background: "var(--b-green)" }} />&lt;5%</span>
              <span><span className="swatch" style={{ background: "var(--b-orange)" }} />5–6%</span>
              <span><span className="swatch" style={{ background: "var(--b-lred)" }} />6–8%</span>
              <span><span className="swatch" style={{ background: "var(--b-dred)" }} />&gt;8%</span>
            </div>
          </div>

          <div className="card">
            <div className="head" style={{ alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Contacts who bounced ({contacts.length})</h2>
              <div className="controls">
                <select value={seqFilter} onChange={(e) => setSeqFilter(e.target.value)}>
                  <option value="all">All sequences</option>
                  {seqCols.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                </select>
                <select value={sdrFilter} onChange={(e) => setSdrFilter(e.target.value)}>
                  <option value="all">All SDRs</option>
                  {sdrNames.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                  <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
                  ⚑ Legit-email only
                </label>
              </div>
            </div>
            <div className="tablescroll" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Contact</th><th>Email</th><th>Sequence</th><th>SDR</th><th>SDR Legit Email</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={(c.contactId || c.email) + i}>
                      <td>{c.name}</td>
                      <td>{c.email}</td>
                      <td>{c.sequence}</td>
                      <td>{c.sdr}</td>
                      <td>
                        {c.legitEmail === "YES" && <span className="pill yes">⚑ YES</span>}
                        {c.legitEmail === "NO" && <span className="pill no">NO</span>}
                        {c.legitEmail === "—" && <span className="pill na">—</span>}
                      </td>
                    </tr>
                  ))}
                  {!contacts.length && (
                    <tr><td colSpan={5} className="sub" style={{ padding: 20 }}>No bounced contacts match the filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="sub" style={{ marginTop: 10 }}>
              <span className="pill yes">⚑ YES</span> = bounced but marked as a legit email → likely wrong enrollment / stale data.{" "}
              <span className="pill no">NO</span> = flagged bad email, expected to bounce (excluded from the adjusted rate).
            </div>
          </div>
        </>
      )}
    </div>
  );
}
