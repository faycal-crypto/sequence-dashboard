import { sequenceNameById, SDR_BY_ID, SDRS } from "./sequences.js";

const BOUNCED = "BOUNCED";
const ATTEMPT_STATUSES = new Set(["SENT", "BOUNCED"]);

const rate = (b, a) => (a > 0 ? b / a : 0);
const ownerName = (id) => (!id ? "Unassigned" : SDR_BY_ID[id] || `Other (${id})`);

// Distinct-contact accumulator: key -> { enrolled:Set, bounced:Set, adj:Set }
function bump(map, key, addr, isBounce, isAdj) {
  let g = map.get(key);
  if (!g) { g = { enrolled: new Set(), bounced: new Set(), adj: new Set() }; map.set(key, g); }
  g.enrolled.add(addr);
  if (isBounce) g.bounced.add(addr);
  if (isAdj) g.adj.add(addr);
}
function stats(g, extra) {
  const enrolled = g ? g.enrolled.size : 0;
  const bounced = g ? g.bounced.size : 0;
  const adj = g ? g.adj.size : 0;
  return {
    ...extra,
    enrolled,
    bounced,
    adjBounced: adj,
    bounceRate: rate(bounced, enrolled),
    adjBounceRate: rate(adj, enrolled),
    noData: enrolled === 0,
  };
}
function byRateDesc(a, b) {
  if (a.enrolled === 0 && b.enrolled === 0) return 0;
  if (a.enrolled === 0) return 1;
  if (b.enrolled === 0) return -1;
  if (b.bounceRate !== a.bounceRate) return b.bounceRate - a.bounceRate;
  return b.enrolled - a.enrolled;
}

// emails: [{id, sequenceId, status, ownerId, to}]
// bouncedContacts: Map<emailId, contact props> (legit_email etc.)
export function buildMetrics(emails, bouncedContacts) {
  const seqMap = new Map();
  const sdrMap = new Map();
  const cellMap = new Map();
  for (const s of SDRS) sdrMap.set(s.ownerId, { enrolled: new Set(), bounced: new Set(), adj: new Set() });

  // overall distinct-contact sets
  const oEnr = new Set(), oBnc = new Set(), oAdj = new Set();
  let emailsSent = 0;

  for (const e of emails) {
    if (!ATTEMPT_STATUSES.has(e.status)) continue;
    emailsSent += 1;
    const isBounce = e.status === BOUNCED;
    const legit = isBounce ? bouncedContacts.get(e.id)?.legit_email : undefined;
    const isAdj = isBounce && legit !== "false"; // adjusted keeps YES + Unknown, drops NO
    // one contact = one recipient address (falls back to email id if missing)
    const addr = e.to || bouncedContacts.get(e.id)?.email || e.id;

    const sId = e.sequenceId || "unknown";
    const oId = e.ownerId || "";
    bump(seqMap, sId, addr, isBounce, isAdj);
    bump(sdrMap, oId, addr, isBounce, isAdj);
    bump(cellMap, `${oId}|${sId}`, addr, isBounce, isAdj);
    oEnr.add(addr); if (isBounce) oBnc.add(addr); if (isAdj) oAdj.add(addr);
  }

  const perSequence = [...seqMap.entries()]
    .map(([id, g]) => stats(g, { id, name: sequenceNameById(id) }))
    .sort(byRateDesc);

  const perSdr = [...sdrMap.entries()]
    .map(([ownerId, g]) => stats(g, { ownerId, name: ownerName(ownerId) }))
    .sort(byRateDesc);

  const matrix = [...cellMap.entries()].map(([key, g]) => {
    const [ownerId, seqId] = key.split("|");
    return stats(g, { ownerId, sdr: ownerName(ownerId), sequenceId: seqId, sequence: sequenceNameById(seqId) });
  });

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
      enrolled: oEnr.size,
      emailsSent,
      bounced: oBnc.size,
      bounceRate: rate(oBnc.size, oEnr.size),
      bouncedContacts: bouncedList.length,
      legitEmailBounces: bouncedList.filter((b) => b.reviewFlag).length,
    },
    adjusted: {
      bounced: oAdj.size,
      enrolled: oEnr.size,
      bounceRate: rate(oAdj.size, oEnr.size),
      excludedBounces: oBnc.size - oAdj.size,
    },
    perSequence,
    perSdr,
    matrix,
    bouncedContacts: bouncedList,
  };
}
