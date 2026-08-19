import { sequenceNameById, SDR_BY_ID, SDRS } from "./sequences.js";

const rate = (b, a) => (a > 0 ? b / a : 0);
const ownerToSdr = (id) => SDR_BY_ID[id] || "Other";

function g() { return { enrolled: 0, bounced: 0, adj: 0 }; }
function withRates(o, extra) {
  return {
    ...extra,
    enrolled: o.enrolled,
    bounced: o.bounced,
    adjBounced: o.adj,
    bounceRate: rate(o.bounced, o.enrolled),
    adjBounceRate: rate(o.adj, o.enrolled),
    noData: o.enrolled === 0,
  };
}
function byRateDesc(a, b) {
  if (a.enrolled === 0 && b.enrolled === 0) return 0;
  if (a.enrolled === 0) return 1;
  if (b.enrolled === 0) return -1;
  if (b.bounceRate !== a.bounceRate) return b.bounceRate - a.bounceRate;
  return b.enrolled - a.enrolled;
}

// Contact-based metrics (HubSpot "last enrollment" method, all sequences).
// enrolledContacts: [{id, hs_latest_sequence_enrolled, hubspot_owner_id, email, legit_email, firstname, lastname}]
// bouncedSet: Set of lowercased recipient addresses that had a BOUNCED sequence email.
// emailsSent: total sequence emails attempted in the window (informational).
export function buildMetrics(enrolledContacts, bouncedSet, emailsSent = 0) {
  const seqMap = new Map();   // seqId -> agg
  const sdrMap = new Map();   // sdrName -> agg
  const cellMap = new Map();  // `${sdrName}|${seqId}` -> agg
  for (const s of SDRS) sdrMap.set(s.name, g());

  let oEnr = 0, oBnc = 0, oAdj = 0;
  const bouncedList = [];

  for (const c of enrolledContacts) {
    const seqId = c.hs_latest_sequence_enrolled;
    if (!seqId) continue;
    const sdr = ownerToSdr(c.hubspot_owner_id);
    const email = (c.email || "").toLowerCase();
    const bounced = !!email && bouncedSet.has(email);
    const legit = c.legit_email; // 'true' | 'false' | undefined
    const adj = bounced && legit !== "false";

    const s = seqMap.get(seqId) || g(); s.enrolled++; if (bounced) s.bounced++; if (adj) s.adj++; seqMap.set(seqId, s);
    const d = sdrMap.get(sdr) || g(); d.enrolled++; if (bounced) d.bounced++; if (adj) d.adj++; sdrMap.set(sdr, d);
    const k = `${sdr}|${seqId}`;
    const cc = cellMap.get(k) || g(); cc.enrolled++; if (bounced) cc.bounced++; if (adj) cc.adj++; cellMap.set(k, cc);

    oEnr++; if (bounced) oBnc++; if (adj) oAdj++;

    if (bounced) {
      bouncedList.push({
        contactId: c.id,
        email: c.email || "—",
        name: [c.firstname, c.lastname].filter(Boolean).join(" ") || "—",
        sequenceId: seqId,
        sequence: sequenceNameById(seqId),
        sdr,
        legitEmail: legit === "true" ? "YES" : legit === "false" ? "NO" : "UNKNOWN",
        reviewFlag: legit === "true",
      });
    }
  }

  const perSequence = [...seqMap.entries()]
    .map(([id, o]) => withRates(o, { id, name: sequenceNameById(id) }))
    .sort(byRateDesc);
  const perSdr = [...sdrMap.entries()]
    .map(([name, o]) => withRates(o, { ownerId: name, name }))
    .sort(byRateDesc);
  const matrix = [...cellMap.entries()].map(([k, o]) => {
    const [sdr, seqId] = k.split("|");
    return withRates(o, { sdr, sequenceId: seqId, sequence: sequenceNameById(seqId) });
  });

  bouncedList.sort((a, b) => Number(b.reviewFlag) - Number(a.reviewFlag));

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      enrolled: oEnr,
      emailsSent,
      bounced: oBnc,
      bounceRate: rate(oBnc, oEnr),
      bouncedContacts: bouncedList.length,
      legitEmailBounces: bouncedList.filter((b) => b.reviewFlag).length,
    },
    adjusted: {
      bounced: oAdj,
      enrolled: oEnr,
      bounceRate: rate(oAdj, oEnr),
      excludedBounces: oBnc - oAdj,
    },
    perSequence,
    perSdr,
    matrix,
    bouncedContacts: bouncedList,
  };
}
