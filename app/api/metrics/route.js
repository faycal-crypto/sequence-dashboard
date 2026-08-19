import { NextResponse } from "next/server";
import {
  searchSequenceEmails,
  fetchEnrolledContacts,
  fetchSequenceNames,
  resolveWindow,
} from "../../../lib/hubspot.js";
import { buildMetrics } from "../../../lib/aggregate.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TTL_MS = 15 * 60 * 1000;
const cacheStore = new Map();

const ENROLLED_PROPS = [
  "hs_latest_sequence_enrolled",
  "hubspot_owner_id",
  "email",
  "legit_email",
  "firstname",
  "lastname",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fresh = searchParams.get("fresh") === "1";
    const def = resolveWindow();
    const qsStart = searchParams.get("start");
    const qsEnd = searchParams.get("end");
    const start = DATE_RE.test(qsStart || "") ? qsStart : def.start;
    const end = DATE_RE.test(qsEnd || "") ? qsEnd : def.end;

    const key = `${start}|${end}`;
    const hit = cacheStore.get(key);
    if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json({ ...hit.data, cached: true });
    }

    // enrolled universe (all sequences, last-enrollment) + all sequence emails (for
    // bounces) + live sequence names (best-effort; falls back to "Sequence <id>")
    const [emails, contacts, nameMap] = await Promise.all([
      searchSequenceEmails({ sequenceIds: [], start, end }),
      fetchEnrolledContacts(start, end, ENROLLED_PROPS),
      fetchSequenceNames().catch(() => ({})),
    ]);
    const metrics = buildMetrics(contacts, emails);

    // Apply live sequence names ONLY where we don't already have a config name
    // (config names in lib/sequences.js take precedence over the HubSpot API name).
    const genericRe = /^Sequence \d+$/;
    const nm = (id, cur) => (genericRe.test(cur) && nameMap[String(id)] ? nameMap[String(id)] : cur);
    metrics.perSequence.forEach((s) => { s.name = nm(s.id, s.name); });
    metrics.matrix.forEach((c) => { c.sequence = nm(c.sequenceId, c.sequence); });
    metrics.bouncedContacts.forEach((c) => { c.sequence = nm(c.sequenceId, c.sequence); });

    const payload = {
      window: { start, end },
      unconfigured: contacts.length === 0,
      configuredSequences: metrics.perSequence.map((s) => ({ id: s.id, name: s.name })),
      ...metrics,
      cached: false,
    };
    cacheStore.set(key, { at: Date.now(), data: payload });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=1800" },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
