import { sequenceNameById, SDR_BY_ID, SDRS } from "./sequences.js";

const BOUNCED = "BOUNCED";
// "attempted" = emails that actually left (delivered or bounced)
const ATTEMPT_STATUSES = new Set(["SENT", "BOUNCED"]);

function rate(bounced, attempted) {
  return attempted > 0 ? bounced / attempted : 0;
}

function ownerName(ownerId) {
  if (!ownerId) return "Unassigned";
  return SDR_BY_ID[ownerId] || `Other (${ownerId})`;
}

// Sort by bounce rate desc; rows with no sends fall to the bottom.
function byRateDesc(a, b) {
  if (a.sent === 0 && b.sent === 0) return 0;
  if (a.sent === 0) return 1;
  if (b.sent === 0) return -1;
  if (b.bounceRate !== a.bounceRate) return b.bounceRate - a.bounceRate;
  return b.sent - a.sent;
}

// emails: [{id, sequenceId, status, ownerId, to}]
// bouncedContacts: Map<emailId, contact props>
export function buildMetrics(emails, bouncedContacts) {
  const seqMap = new Map(); // sequenceId -> {sent, bounced}
  const sdrMap = new Map(); // ownerId -> {sent, bounced}
  const cellMap = new Map(); // `${ownerId}|${seqId}` -> {sent, bounced}

  // seed all configured SDRs so they always appear (even with zero sends)
  for (const s of SDRS) sdrMap.set(s.ownerId, { sent: 0, bounced: 0 });

  for (const e of emails) {
    const isAttempt = ATTEMPT_STATUSES.has(e.status);
    const isBounce = e.status === BOUNCED;
    if (!isAttempt) continue;

    const sId = e.sequenceId || "unknown";
    const oId = e.ownerId || "";

    const s = seqMap.get(sId) || { sent: 0, bounced: 0 };
    s.sent += 1;
    if (isBounce) s.bounced += 1;
    seqMap.set(sId, s);

    const d = sdrMap.get(oId) || { sent: 0, bounced: 0 };
    d.sent += 1;
    if (isBounce) d.bounced += 1;
    sdrMap.set(oId, d);

    const key = `${oId}|${sId}`;
    const c = cellMap.get(key) || { sent: 0, bounced: 0 };
    c.sent += 1;
    if (isBounce) c.bounced += 1;
    cellMap.set(key, c);
  }

  const perSequence = [...seqMap.entries()]
    .map(([id, v]) => ({
      id,
      name: sequenceNameById(id),
      sent: v.sent,
      bounced: v.bounced,
      bounceRate: rate(v.bounced, v.sent),
    }))
    .sort(byRateDesc);

  const perSdr = [...sdrMap.entries()]
    .map(([ownerId, v]) => ({
      ownerId,
      name: ownerName(ownerId),
      sent: v.sent,
      bounced: v.bounced,
      bounceRate: rate(v.bounced, v.sent),
      noData: v.sent === 0,
    }))
    .sort(byRateDesc);

  const matrix = [...cellMap.entries()].map(([key, v]) => {
    const [ownerId, seqId] = key.split("|");
    return {
      ownerId,
      sdr: ownerName(ownerId),
      sequenceId: seqId,
      sequence: sequenceNameById(seqId),
      sent: v.sent,
      bounced: v.bounced,
      bounceRate: rate(v.bounced, v.sent),
    };
  });

  const totalSent = perSequence.reduce((a, s) => a + s.sent, 0);
  const totalBounced = perSequence.reduce((a, s) => a + s.bounced, 0);

  // ---- Bounced contacts + adjusted (excluding legit_email = NO) -------------
  const seenContacts = new Set();
  const bouncedList = [];
  // adjusted = bounces whose contact is NOT flagged "SDR Legit Email = NO"
  let adjTotalBounced = 0;
  const adjByOwner = new Map(); // ownerId -> adjusted bounced count
  for (const s of SDRS) adjByOwner.set(s.ownerId, 0);

  for (const e of emails) {
    if (e.status !== BOUNCED) continue;
    const c = bouncedContacts.get(e.id);
    const legit = c?.legit_email; // 'true' | 'false' | undefined
    // adjusted rate excludes known-bad addresses (legit_email = NO / 'false')
    if (legit !== "false") {
      adjTotalBounced += 1;
      const oId = e.ownerId || "";
      adjByOwner.set(oId, (adjByOwner.get(oId) || 0) + 1);
    }

    const contactId = c?.id || e.to || e.id;
    if (seenContacts.has(contactId)) continue;
    seenContacts.add(contactId);
    bouncedList.push({
      contactId: c?.id || null,
      email: c?.email || e.to || "—",
      name: [c?.firstname, c?.lastname].filter(Boolean).join(" ") || "—",
      sequenceId: e.sequenceId,
      sequence: sequenceNameById(e.sequenceId),
      sdr: ownerName(e.ownerId),
      legitEmail: legit === "true" ? "YES" : legit === "false" ? "NO" : "—",
      reviewFlag: legit === "true",
    });
  }
  bouncedList.sort((a, b) => Number(b.reviewFlag) - Number(a.reviewFlag));

  const adjustedPerSdr = perSdr.map((s) => {
    const adjBounced = adjByOwner.get(s.ownerId) || 0;
    return {
      ownerId: s.ownerId,
      name: s.name,
      sent: s.sent,
      bounced: adjBounced,
      bounceRate: rate(adjBounced, s.sent),
      noData: s.sent === 0,
    };
  }).sort(byRateDesc);

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
      bounced: adjTotalBounced,
      sent: totalSent,
      bounceRate: rate(adjTotalBounced, totalSent),
      excludedBounces: totalBounced - adjTotalBounced,
      perSdr: adjustedPerSdr,
    },
    perSequence,
    perSdr,
    matrix,
    bouncedContacts: bouncedList,
  };
}
