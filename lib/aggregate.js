import { sequenceNameById, SDR_BY_ID, SDRS } from "./sequences.js";

const rate = (b, a) => (a > 0 ? b / a : 0);

// Owner label mapping for the per-SDR / SDR×sequence reports (by EMAIL SENDER).
// The 4 SDRs + Vivian Wang are named; everyone else is bucketed as "Other".
const OWNER_LABELS = { ...SDR_BY_ID, "137596738": "Vivian Wang" };
const senderLabel = (ownerId) => OWNER_LABELS[ownerId] || (ownerId ? "Other" : "Unassigned");

function byRateDesc(a, b) {
  if (a.enrolled === 0 && b.enrolled === 0) return 0;
  if (a.enrolled === 0) return 1;
  if (b.enrolled === 0) return -1;
  if (b.bounceRate !== a.bounceRate) return b.bounceRate - a.bounceRate;
  return b.enrolled - a.enrolled;
}
function setStats(o, extra) {
  const enrolled = o.enrolled.size, bounced = o.bounced.size, adj = o.adj.size;
  return { ...extra, enrolled, bounced, adjBounced: adj, bounceRate: rate(bounced, enrolled), adjBounceRate: rate(adj, enrolled), noData: enrolled === 0 };
}
function newSets() { return { enrolled: new Set(), bounced: new Set(), adj: new Set() }; }

// enrolledContacts: [{id, hs_latest_sequence_enrolled, hubspot_owner_id, email, legit_email, firstname, lastname}]
// emails: [{id, sequenceId, status, ownerId, to}]  (all sequences, in window)
export function buildMetrics(enrolledContacts, emails) {
  // ---- signals derived from emails ----
  const bouncedSet = new Set();              // lowercased addr with a BOUNCED email
  const senderByBounced = new Map();         // lowercased addr -> sender label (first bounce seen)
  let emailsSent = 0;
  for (const e of emails) {
    if (e.status !== "SENT" && e.status !== "BOUNCED") continue;
    emailsSent += 1;
    if (e.status === "BOUNCED" && e.to) {
      const a = e.to.toLowerCase();
      bouncedSet.add(a);
      if (!senderByBounced.has(a)) senderByBounced.set(a, senderLabel(e.ownerId));
    }
  }
  const legitByEmail = new Map();
  for (const c of enrolledContacts) {
    if (c.email) legitByEmail.set(c.email.toLowerCase(), c.legit_email);
  }

  // ---- per-sequence + totals: CONTACT based (last-enrollment, matches HubSpot) ----
  const seqMap = new Map();
  let oEnr = 0, oBnc = 0, oAdj = 0;
  const seen = new Set();
  const bouncedList = [];
  for (const c of enrolledContacts) {
    const seqId = c.hs_latest_sequence_enrolled;
    if (!seqId) continue;
    const email = (c.email || "").toLowerCase();
    const bounced = !!email && bouncedSet.has(email);
    const legit = c.legit_email;
    const adj = bounced && legit !== "false";

    const s = seqMap.get(seqId) || { enrolled: 0, bounced: 0, adj: 0 };
    s.enrolled++; if (bounced) s.bounced++; if (adj) s.adj++; seqMap.set(seqId, s);
    oEnr++; if (bounced) oBnc++; if (adj) oAdj++;

    if (bounced && !seen.has(c.id)) {
      seen.add(c.id);
      bouncedList.push({
        contactId: c.id,
        email: c.email || "—",
        name: [c.firstname, c.lastname].filter(Boolean).join(" ") || "—",
        sequenceId: seqId,
        sequence: sequenceNameById(seqId),
        sdr: senderByBounced.get(email) || senderLabel(c.hubspot_owner_id),
        legitEmail: legit === "true" ? "YES" : legit === "false" ? "NO" : "UNKNOWN",
        reviewFlag: legit === "true",
      });
    }
  }
  const perSequence = [...seqMap.entries()].map(([id, o]) => ({
    id, name: sequenceNameById(id), enrolled: o.enrolled, bounced: o.bounced, adjBounced: o.adj,
    bounceRate: rate(o.bounced, o.enrolled), adjBounceRate: rate(o.adj, o.enrolled), noData: o.enrolled === 0,
  })).sort(byRateDesc);

  // ---- per-SDR + matrix: EMAIL SENDER based (distinct emailed contacts) ----
  const sdrMap = new Map();   // label -> sets
  const cellMap = new Map();  // `${label}|${seqId}` -> sets
  for (const s of SDRS) sdrMap.set(s.name, newSets());
  sdrMap.set("Vivian Wang", newSets());
  for (const e of emails) {
    if (e.status !== "SENT" && e.status !== "BOUNCED") continue;
    const addr = (e.to || "").toLowerCase();
    if (!addr) continue;
    const label = senderLabel(e.ownerId);
    const seqId = e.sequenceId || "unknown";
    const isB = e.status === "BOUNCED";
    const isAdj = isB && legitByEmail.get(addr) !== "false";

    const d = sdrMap.get(label) || newSets();
    d.enrolled.add(addr); if (isB) d.bounced.add(addr); if (isAdj) d.adj.add(addr); sdrMap.set(label, d);
    const k = `${label}|${seqId}`;
    const cc = cellMap.get(k) || newSets();
    cc.enrolled.add(addr); if (isB) cc.bounced.add(addr); if (isAdj) cc.adj.add(addr); cellMap.set(k, cc);
  }
  const perSdr = [...sdrMap.entries()].map(([name, o]) => setStats(o, { ownerId: name, name })).sort(byRateDesc);
  const matrix = [...cellMap.entries()].map(([k, o]) => {
    const [sdr, seqId] = k.split("|");
    return setStats(o, { sdr, sequenceId: seqId, sequence: sequenceNameById(seqId) });
  });

  bouncedList.sort((a, b) => Number(b.reviewFlag) - Number(a.reviewFlag));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      enrolled: oEnr, emailsSent, bounced: oBnc, bounceRate: rate(oBnc, oEnr),
      bouncedContacts: bouncedList.length, legitEmailBounces: bouncedList.filter((b) => b.reviewFlag).length,
    },
    adjusted: { bounced: oAdj, enrolled: oEnr, bounceRate: rate(oAdj, oEnr), excludedBounces: oBnc - oAdj },
    perSequence,
    perSdr,
    matrix,
    bouncedContacts: bouncedList,
  };
}
