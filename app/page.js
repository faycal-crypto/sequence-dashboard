"use client";

import { useEffect, useMemo, useState } from "react";

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const num = (n) => (n ?? 0).toLocaleString("en-US");

// Bounce-rate bands: <5% green · 5–6% orange · 6–8% light red · >8% dark red
function bounceColor(rate) {
  if (rate < 0.05) return "var(--b-green)";
  if (rate < 0.06) return "var(--b-orange)";
  if (rate <= 0.08) return "var(--b-lred)";
  return "var(--b-dred)";
}
const cellInk = (rate) => (rate > 0.08 ? "#fff" : "#0b0b0b");

const fmt = (d) => d.toISOString().slice(0, 10);
function presetRange(kind) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  if (kind === "month") return { start: fmt(new Date(Date.UTC(y, m, 1))), end: fmt(now) };
  if (kind === "30d") { const s = new Date(now); s.setUTCDate(s.getUTCDate() - 29); return { start: fmt(s), end: fmt(now) }; }
  if (kind === "lastmonth") return { start: fmt(new Date(Date.UTC(y, m - 1, 1))), end: fmt(new Date(Date.UTC(y, m, 0))) };
  return null;
}

function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12, color: "var(--text-secondary)" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function BarList({ rows, adjusted, emptyLabel }) {
  const getRate = (r) => (adjusted ? r.adjBounceRate : r.bounceRate);
  const getBnc = (r) => (adjusted ? r.adjBounced : r.bounced);
  const sorted = [...rows].sort((a, b) => {
    if (a.noData && b.noData) return 0;
    if (a.noData) return 1;
    if (b.noData) return -1;
    return getRate(b) - getRate(a) || b.enrolled - a.enrolled;
  });
  const max = Math.max(0.0001, ...sorted.map(getRate));
  if (!rows.length) return <p className="sub">{emptyLabel}</p>;
  return (
    <div>
      {sorted.map((r) => (
        <div className="bar-row" key={r.id || r.ownerId || r.name}
             title={r.noData ? `${r.name}: no enrollment yet` : `${r.name}: ${getBnc(r)} bounced / ${r.enrolled} enrolled`}>
          <span className={"bar-name" + (r.noData ? " dim" : "")}>{r.name}</span>
          <span className="bar-track">
            {!r.noData && <span className="bar-fill" style={{ width: `${(getRate(r) / max) * 100}%`, background: bounceColor(getRate(r)) }} />}
          </span>
          <span className="bar-val">
            {r.noData ? <span className="none">no enrollment</span>
              : <>{pct(getRate(r))} <span className="muted">({getBnc(r)}/{r.enrolled})</span></>}
          </span>
        </div>
      ))}
    </div>
  );
}

const LEGIT_PILL = (v) =>
  v === "YES" ? <span className="pill yes">⚑ YES</span>
    : v === "NO" ? <span className="pill no">NO</span>
      : <span className="pill na">Unknown</span>;

export default function Page() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [seqFilter, setSeqFilter] = useState("all");
  const [sdrFilter, setSdrFilter] = useState("all");
  const [legitFilter, setLegitFilter] = useState("all");
  const [range, setRange] = useState({ start: "", end: "" });
  const [preset, setPreset] = useState("month");
  const [theme, setTheme] = useState("system");

  // per-report adjusted toggles
  const [adjSeq, setAdjSeq] = useState(false);
  const [adjSdr, setAdjSdr] = useState(false);
  const [adjMatrix, setAdjMatrix] = useState(false);

  // data-hygiene (SDR lists) — loaded on demand
  const [hyg, setHyg] = useState({ loading: false, data: null, error: null });
  const [unkSdr, setUnkSdr] = useState("all");
  const [yesSdr, setYesSdr] = useState("all");
  const [yesBounceOnly, setYesBounceOnly] = useState(false);

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
    const isDark = theme === "dark" ||
      (theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(isDark ? "light" : "dark");
  }

  async function load(fresh, r) {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams();
      if (fresh) params.set("fresh", "1");
      if (r?.start && r?.end) { params.set("start", r.start); params.set("end", r.end); }
      const qs = params.toString();
      const res = await fetch(`/api/metrics${qs ? `?${qs}` : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setData(json);
      if (json.window && !range.start) setRange(json.window);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(false, null); }, []);

  function applyPreset(kind) { setPreset(kind); const r = presetRange(kind); if (r) { setRange(r); load(true, r); } }
  function applyCustom() { setPreset("custom"); if (range.start && range.end) load(true, range); }

  async function loadHygiene(fresh) {
    setHyg((h) => ({ ...h, loading: true, error: null }));
    try {
      const res = await fetch(`/api/lists${fresh ? "?fresh=1" : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setHyg({ loading: false, data: json, error: null });
    } catch (e) { setHyg({ loading: false, data: null, error: e.message }); }
  }

  const contacts = useMemo(() => {
    if (!data?.bouncedContacts) return [];
    return data.bouncedContacts.filter((c) => {
      if (seqFilter !== "all" && String(c.sequenceId) !== seqFilter) return false;
      if (sdrFilter !== "all" && c.sdr !== sdrFilter) return false;
      if (legitFilter !== "all" && c.legitEmail !== legitFilter) return false;
      return true;
    });
  }, [data, seqFilter, sdrFilter, legitFilter]);

  const sdrNames = useMemo(() => (data?.perSdr || []).map((s) => s.name), [data]);
  const seqCols = useMemo(() => data?.configuredSequences || [], [data]);
  const matrixLookup = useMemo(() => {
    const m = new Map();
    for (const c of data?.matrix || []) m.set(`${c.sdr}|${c.sequenceId}`, c);
    return m;
  }, [data]);
  const hygSdrs = useMemo(() => (hyg.data?.lists || []).map((l) => l.sdr), [hyg]);

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

      <div className="card" style={{ marginTop: 14, paddingTop: 14, paddingBottom: 14 }}>
        <div className="controls">
          <button className={"preset" + (preset === "month" ? " active" : "")} onClick={() => applyPreset("month")}>This month</button>
          <button className={"preset" + (preset === "30d" ? " active" : "")} onClick={() => applyPreset("30d")}>Last 30 days</button>
          <button className={"preset" + (preset === "lastmonth" ? " active" : "")} onClick={() => applyPreset("lastmonth")}>Last month</button>
          <span className="datefld">
            From <input type="date" value={range.start || ""} onChange={(e) => setRange({ ...range, start: e.target.value })} />
            to <input type="date" value={range.end || ""} onChange={(e) => setRange({ ...range, end: e.target.value })} />
          </span>
          <button onClick={applyCustom} disabled={loading || !range.start || !range.end}>Apply</button>
        </div>
      </div>

      {error && <div className="err"><strong>Couldn’t load data.</strong> {error}</div>}

      {data?.unconfigured && (
        <div className="notice"><strong>No sequence IDs configured yet.</strong> Add them in <code>lib/sequences.js</code> — see <a href="/api/sequences" target="_blank" rel="noreferrer">/api/sequences</a>.</div>
      )}

      {loading && !data && <div className="spin">Loading…</div>}

      {data && !data.unconfigured && (
        <>
          <div className="kpis">
            <div className="kpi"><div className="label">Contacts enrolled</div><div className="value">{num(data.totals.enrolled)}</div><div className="foot">{num(data.totals.emailsSent)} emails · {data.perSequence.length} sequences</div></div>
            <div className="kpi"><div className="label">Bounced</div><div className="value">{num(data.totals.bounced)}</div><div className="foot">{data.totals.bouncedContacts} unique contacts</div></div>
            <div className="kpi"><div className="label">Bounce rate</div><div className="value" style={{ color: bounceColor(data.totals.bounceRate) }}>{pct(data.totals.bounceRate)}</div><div className="foot">bounced / enrolled contacts</div></div>
            <div className="kpi"><div className="label">Adjusted bounce rate</div><div className="value" style={{ color: bounceColor(data.adjusted.bounceRate) }}>{pct(data.adjusted.bounceRate)}</div><div className="foot">excl. legit-email = NO</div></div>
            <div className="kpi"><div className="label">⚑ Legit-email bounces</div><div className="value">{num(data.totals.legitEmailBounces)}</div><div className="foot">bounced but “SDR Legit Email” = YES</div></div>
          </div>

          <div className="grid2">
            <div className="card">
              <div className="head" style={{ alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>Bounce rate per sequence</h2>
                <Toggle checked={adjSeq} onChange={setAdjSeq} label="Adjusted view" />
              </div>
              <BarList rows={data.perSequence} adjusted={adjSeq} emptyLabel="No sequence emails in window." />
              <div className="sub" style={{ marginTop: 8 }}>Denominator = enrolled contacts (matches HubSpot).</div>
            </div>
            <div className="card">
              <div className="head" style={{ alignItems: "center", marginBottom: 12 }}>
                <h2 style={{ margin: 0 }}>Bounce rate per SDR</h2>
                <Toggle checked={adjSdr} onChange={setAdjSdr} label="Adjusted view" />
              </div>
              <BarList rows={data.perSdr} adjusted={adjSdr} emptyLabel="No SDR sends in window." />
              <div className="sub" style={{ marginTop: 8 }}>Denominator = contacts emailed, attributed to the sending SDR (HubSpot has no per-SDR enrolled figure).</div>
            </div>
          </div>

          <div className="card">
            <div className="head" style={{ alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Bounce rate — SDR × sequence</h2>
              <Toggle checked={adjMatrix} onChange={setAdjMatrix} label="Adjusted view" />
            </div>
            <div className="tablescroll">
              <table className="heat">
                <thead>
                  <tr><th>SDR</th>{seqCols.map((s) => <th className="rot num" key={s.id} title={s.name}>{s.name}</th>)}</tr>
                </thead>
                <tbody>
                  {sdrNames.map((sdr) => (
                    <tr key={sdr}>
                      <td>{sdr}</td>
                      {seqCols.map((s) => {
                        const cell = matrixLookup.get(`${sdr}|${s.id}`);
                        const has = !!cell && cell.enrolled > 0;
                        const r = has ? (adjMatrix ? cell.adjBounceRate : cell.bounceRate) : 0;
                        const b = has ? (adjMatrix ? cell.adjBounced : cell.bounced) : 0;
                        return (
                          <td key={s.id}>
                            {has ? (
                              <div className="cell" style={{ background: bounceColor(r), color: cellInk(r) }} title={`${b}/${cell.enrolled}`}>
                                {pct(r)}<div style={{ fontSize: 10, opacity: 0.85 }}>{b}/{cell.enrolled}</div>
                              </div>
                            ) : <span style={{ color: "var(--muted)" }}>—</span>}
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
            <div className="sub" style={{ marginTop: 8 }}>Cells: bounced / contacts emailed by that SDR in that sequence.</div>
          </div>

          {/* Contacts who bounced */}
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
                <select value={legitFilter} onChange={(e) => setLegitFilter(e.target.value)}>
                  <option value="all">SDR Legit Email: all</option>
                  <option value="YES">YES</option>
                  <option value="NO">NO</option>
                  <option value="UNKNOWN">Unknown</option>
                </select>
              </div>
            </div>
            <div className="tablescroll" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Contact</th><th>Email</th><th>Sequence</th><th>SDR</th><th>SDR Legit Email</th></tr></thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={(c.contactId || c.email) + i}>
                      <td>{c.name}</td><td>{c.email}</td><td>{c.sequence}</td><td>{c.sdr}</td><td>{LEGIT_PILL(c.legitEmail)}</td>
                    </tr>
                  ))}
                  {!contacts.length && <tr><td colSpan={5} className="sub" style={{ padding: 20 }}>No bounced contacts match the filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="sub" style={{ marginTop: 10 }}>
              <span className="pill yes">⚑ YES</span> = bounced but marked legit → likely wrong enrollment / stale data.{" "}
              <span className="pill no">NO</span> = flagged bad email (excluded from adjusted rate).{" "}
              <span className="pill na">Unknown</span> = SDR Legit Email not set yet.
            </div>
          </div>

          {/* Adjusted report — moved below the contacts table */}
          <div className="card">
            <h2>Adjusted bounce rate — excluding “SDR Legit Email = NO”</h2>
            <div className="recalc-hero">
              <span className="big" style={{ color: bounceColor(data.adjusted.bounceRate) }}>{pct(data.adjusted.bounceRate)}</span>
              <span className="sub" style={{ marginTop: 0 }}>
                overall · {num(data.adjusted.bounced)} bounces counted ({num(data.adjusted.excludedBounces)} excluded as known-bad) / {num(data.adjusted.enrolled)} enrolled contacts
              </span>
            </div>
            <BarList rows={data.perSdr} adjusted={true} emptyLabel="No SDR sends in window." />
          </div>

          {/* Data hygiene — SDR lists (loaded on demand) */}
          <div className="card">
            <div className="head" style={{ alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>SDR list hygiene — “SDR Legit Email” review</h2>
              <button className="primary" onClick={() => loadHygiene(!!hyg.data)} disabled={hyg.loading}>
                {hyg.loading ? "Loading…" : hyg.data ? "Reload" : "Load SDR lists"}
              </button>
            </div>
            {hyg.error && <div className="err" style={{ marginTop: 12 }}>{hyg.error} <div className="sub" style={{ marginTop: 6 }}>Check the <code>crm.lists.read</code> scope on the service key and the <code>listId</code> values in <code>lib/sequences.js</code>.</div></div>}
            {!hyg.data && !hyg.loading && !hyg.error && (
              <p className="sub" style={{ marginTop: 12 }}>Load the SDR lists to review contacts by SDR Legit Email (heavier query — hence the button).</p>
            )}

            {hyg.data && (
              <>
                <div className="sub" style={{ marginTop: 10 }}>
                  {hyg.data.lists.map((l) => `${l.sdr}: ${l.total}`).join(" · ")} · updated {new Date(hyg.data.generatedAt).toLocaleString()}
                </div>

                {/* Unknown */}
                <div style={{ marginTop: 18 }}>
                  <div className="head" style={{ alignItems: "center" }}>
                    <h2 style={{ margin: 0, fontSize: 14 }}>Legit Email = Unknown ({hyg.data.unknown.filter((c) => unkSdr === "all" || c.sdr === unkSdr).length})</h2>
                    <select value={unkSdr} onChange={(e) => setUnkSdr(e.target.value)}>
                      <option value="all">All SDRs</option>
                      {hygSdrs.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="tablescroll" style={{ marginTop: 10 }}>
                    <table>
                      <thead><tr><th>Contact</th><th>Email</th><th>SDR</th></tr></thead>
                      <tbody>
                        {hyg.data.unknown.filter((c) => unkSdr === "all" || c.sdr === unkSdr).map((c, i) => (
                          <tr key={c.contactId + i}><td>{c.name}</td><td>{c.email}</td><td>{c.sdr}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* YES */}
                <div style={{ marginTop: 22 }}>
                  <div className="head" style={{ alignItems: "center" }}>
                    <h2 style={{ margin: 0, fontSize: 14 }}>Legit Email = YES ({hyg.data.yes.filter((c) => (yesSdr === "all" || c.sdr === yesSdr) && (!yesBounceOnly || c.priorBounce)).length})</h2>
                    <div className="controls">
                      <Toggle checked={yesBounceOnly} onChange={setYesBounceOnly} label="Previously bounced/failed only" />
                      <select value={yesSdr} onChange={(e) => setYesSdr(e.target.value)}>
                        <option value="all">All SDRs</option>
                        {hygSdrs.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="tablescroll" style={{ marginTop: 10 }}>
                    <table>
                      <thead><tr><th>Contact</th><th>Email</th><th>SDR</th><th>Previous email bounced / failed</th></tr></thead>
                      <tbody>
                        {hyg.data.yes.filter((c) => (yesSdr === "all" || c.sdr === yesSdr) && (!yesBounceOnly || c.priorBounce)).map((c, i) => (
                          <tr key={c.contactId + i}>
                            <td>{c.name}</td><td>{c.email}</td><td>{c.sdr}</td>
                            <td>{c.priorBounce ? <span className="pill yes" title={c.reason}>⚑ YES</span> : <span className="pill no">No</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="sub" style={{ marginTop: 8 }}>“Previous email bounced/failed” = hard bounce, invalid address, or a marketing bounce recorded on the contact.</div>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
