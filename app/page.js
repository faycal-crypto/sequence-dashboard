"use client";

import { useEffect, useMemo, useState } from "react";

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const num = (n) => (n ?? 0).toLocaleString("en-US");

function heatColor(rate, hasData) {
  if (!hasData) return { bg: "transparent", fg: "var(--muted)" };
  if (rate <= 0) return { bg: "var(--grid)", fg: "var(--muted)" };
  if (rate < 0.02) return { bg: "var(--seq-100)", fg: "var(--text-primary)" };
  if (rate < 0.05) return { bg: "var(--seq-250)", fg: "var(--text-primary)" };
  if (rate < 0.1) return { bg: "var(--seq-400)", fg: "#fff" };
  if (rate < 0.2) return { bg: "var(--seq-550)", fg: "#fff" };
  return { bg: "var(--seq-700)", fg: "#fff" };
}

function BarList({ rows, emptyLabel }) {
  const max = Math.max(0.0001, ...rows.map((r) => r.bounceRate));
  if (!rows.length) return <p className="sub">{emptyLabel}</p>;
  return (
    <div>
      {rows.map((r) => (
        <div className="bar-row" key={r.id || r.ownerId || r.name} title={`${r.name}: ${r.bounced} bounced / ${r.sent} sent`}>
          <span className="bar-name">{r.name}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${(r.bounceRate / max) * 100}%` }} />
          </span>
          <span className="bar-val">
            {pct(r.bounceRate)}{" "}
            <span className="muted">({r.bounced}/{r.sent})</span>
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

  async function load(fresh) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/metrics${fresh ? "?fresh=1" : ""}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(false); }, []);

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
          <h1>Sequence Performance — Bounce Analysis</h1>
          <div className="sub">
            {data?.window ? `${data.window.start} → ${data.window.end}` : "…"}
            {data?.generatedAt && ` · updated ${new Date(data.generatedAt).toLocaleString()}`}
            {data?.cached && " · cached"}
          </div>
        </div>
        <div className="controls">
          <button className="primary" onClick={() => load(true)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
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
          <strong>No sequence IDs configured yet.</strong> Add the August sequence IDs in{" "}
          <code>lib/sequences.js</code>. To find them, open <a href="/api/sequences" target="_blank" rel="noreferrer">/api/sequences</a>{" "}
          — it lists every sequence that sent emails in the window, with counts, so you can match IDs to names.
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
              <div className="value">{pct(data.totals.bounceRate)}</div>
              <div className="foot">bounced / attempted</div>
            </div>
            <div className="kpi">
              <div className="label">SDRs</div>
              <div className="value">{data.perSdr.length}</div>
              <div className="foot">with sends in window</div>
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
                        const col = heatColor(cell?.bounceRate || 0, has);
                        return (
                          <td key={s.id}>
                            <div className="cell" style={{ background: col.bg, color: col.fg }}
                                 title={has ? `${cell.bounced}/${cell.sent}` : "no sends"}>
                              {has ? pct(cell.bounceRate) : "—"}
                              {has && <div style={{ fontSize: 10, opacity: 0.85 }}>{cell.bounced}/{cell.sent}</div>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="legend">
              <span><span className="swatch" style={{ background: "var(--seq-100)" }} />&lt;2%</span>
              <span><span className="swatch" style={{ background: "var(--seq-250)" }} />2–5%</span>
              <span><span className="swatch" style={{ background: "var(--seq-400)" }} />5–10%</span>
              <span><span className="swatch" style={{ background: "var(--seq-550)" }} />10–20%</span>
              <span><span className="swatch" style={{ background: "var(--seq-700)" }} />≥20%</span>
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
                    <th>Contact</th>
                    <th>Email</th>
                    <th>Sequence</th>
                    <th>SDR</th>
                    <th>SDR Legit Email</th>
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
              <span className="pill yes">⚑ YES</span> = contact bounced but is marked as a legit email →
              likely enrolled in the wrong sequence or not properly updated. <span className="pill no">NO</span> = flagged bad email, expected to bounce.
            </div>
          </div>
        </>
      )}
    </div>
  );
}
