import { NextResponse } from "next/server";
import {
  searchSequenceEmails,
  fetchEnrolledContacts,
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

    // enrolled universe (all sequences, last-enrollment) + all sequence emails (for bounces)
    const [emails, contacts] = await Promise.all([
      searchSequenceEmails({ sequenceIds: [], start, end }),
      fetchEnrolledContacts(start, end, ENROLLED_PROPS),
    ]);
    const bouncedSet = new Set(
      emails.filter((e) => e.status === "BOUNCED" && e.to).map((e) => e.to.toLowerCase())
    );
    const emailsSent = emails.filter((e) => e.status === "SENT" || e.status === "BOUNCED").length;

    const metrics = buildMetrics(contacts, bouncedSet, emailsSent);

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
