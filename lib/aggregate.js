import { sequenceNameById, SDR_BY_ID, SDRS } from "./sequences.js";

const BOUNCED = "BOUNCED";
const ATTEMPT_STATUSES = new Set(["SENT", "BOUNCED"]);

const rate = (b, a) => (a > 0 ? b / a : 0);
const ownerName = (id) => (!id ? "Unassigned" : SDR_BY_ID[id] || `Other (${id})`);

function byRateDesc(a, b) {
  if (a.sent === 0 && b.sent === 0) return 0;
  if (a.sent === 0) return 1;
  if (b.sent === 0) return -1;
  if (b.bounceRate !== a.bounceRate) return b.bounceRate - a.bounceRate;
  return b.sent - a.sent;
}

// emails: [{id, sequenceId, status, ownerId, to}]
// bouncedContacts: Map<emailId, contact props> (legit_email etc.)
export function buildMetrics(emails, bouncedContacts) {
  const seqMap = new Map(); // id -> {sent, bounced, adj}
  const sdrMap = new Map(); // ownerId -> {sent, bounced, adj}
  const cellMap = new Map(); // `${ownerId}|${seqId}` -> {sent, bounced, adj}

  for (const s of SDRS) sdrMap.set(s.ownerId, { sent: 0, bounced: 0, adj: 0 });

  for (const e of emails) {
    if (!ATTEMPT_STATUSES.has(e.status)) continue;
    const isBounce = e.status === BOUNCED;
    // adjusted = bounce whose contact is NOT flagged legit_email = NO ('false')
    const legit = isBounce ? bouncedContacts.get(e.id)?.legit_email : undefined;
    const isAdj = isBounce && legit !== "false";

    const sId = e.sequenceId || "unknown";
    const oId = e.ownerId || "";

    const s = seqMap.get(sId) || { sent: 0, bounced: 0, adj: 0 };
    s.sent += 1; if (isBounce) s.bounced += 1; if (isAdj) s.adj += 1;
    seqMap.set(sId, s);

    const d = sdrMap.get(oId) || { sent: 0, bounced: 0, adj: 0 };
    d.sent += 1; if (isBounce) d.bounced += 1; if (isAdj) d.adj += 1;
    sdrMap.set(oId, d);

    const key = `${oId}|${sId}`;
    const c = cellMap.get(key) || { sent: 0, bounced: 0, adj: 0 };
    c.sent += 1; if (isBounce) c.bounced += 1; if (isAdj) c.adj += 1;
    cellMap.set(key, c);
  }

  const withRates = (o, extra) => ({
    ...extra,
    sent: o.sent,
    bounced: o.bounced,
    bounceRate: rate(o.bounced, o.sent),
    adjBounced: o.adj,
    adjBounceRate: rate(o.adj, o.sent),
    noData: o.sent === 0,
  });

  const perSequence = [...seqMap.entries()]
    .map(([id, v]) => withRates(v, { id, name: sequenceNameById(id) }))
    .sort(byRateDesc);

  const perSdr = [...sdrMap.entries()]
    .map(([ownerId, v]) => withRates(v, { ownerId, name: ownerName(ownerId) }))
    .sort(byRateDesc);

  const matrix = [...cellMap.entries()].map(([key, v]) => {
    const [ownerId, seqId] = key.split("|");
    return withRates(v, {
      ownerId, sdr: ownerName(ownerId), sequenceId: seqId, sequence: sequenceNameById(seqId),
    });
  });

  const totalSent = perSequence.reduce((a, s) => a + s.sent, 0);
  const totalBounced = perSequence.reduce((a, s) => a + s.bounced, 0);
  const totalAdj = perSequence.reduce((a, s) => a + s.adjBounced, 0);

  // Bounced contacts table (deduped by contact)
  const seen = new Set();
  const bouncedList = [];
  for (const e of emails) {
    if (e.status !== BOUNCED) continue;
    const c = bouncedContacts.get(e.id);
    const legit = c?.legit_email;
    const contactId = c?.id || e.to || e.id;
    if (seen.has(contactId)) continue;
    seen.add(contactId);
    bouncedList.push({
      contactId: c?.id || null,
      email: c?.email || e.to || "—",
      name: [c?.firstname, c?.lastname].filter(Boolean).join(" ") || "—",
      sequenceId: e.sequenceId,
      sequence: sequenceNameById(e.sequenceId),
      sdr: ownerName(e.ownerId),
      legitEmail: legit === "true" ? "YES" : legit === "false" ? "NO" : "UNKNOWN",
      reviewFlag: legit === "true",
    });
  }
  bouncedList.sort((a, b) => Number(b.reviewFlag) - Number(a.reviewFlag));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      sent: totalSent,
      bounced: totalBounced,
      bounceRate: rate(totalBounced, totalSent),
      bouncedContacts: bouncedList.length,
      legitEmailBounces: bouncedList.filter((b) => b.reviewFlag).length,
    },
    adjusted: {
      bounced: totalAdj,
      sent: totalSent,
      bounceRate: rate(totalAdj, totalSent),
      excludedBounces: totalBounced - totalAdj,
    },
    perSequence,
    perSdr,
    matrix,
    bouncedContacts: bouncedList,
  };
}
