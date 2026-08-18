import { NextResponse } from "next/server";
import {
  searchSequenceEmails,
  contactsForEmails,
  resolveWindow,
  countEnrolled,
} from "../../../lib/hubspot.js";
import { buildMetrics } from "../../../lib/aggregate.js";
import { activeSequences } from "../../../lib/sequences.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TTL_MS = 15 * 60 * 1000; // 15 min
const cacheStore = new Map(); // key -> { at, data }

const CONTACT_PROPS = [
  "email",
  "firstname",
  "lastname",
  "sdr_owner",
  "legit_email",
  "hubspot_owner_id",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fresh = searchParams.get("fresh") === "1";

    // Date range: explicit ?start=&end= (YYYY-MM-DD) override the env/default window.
    const def = resolveWindow();
    const qsStart = searchParams.get("start");
    const qsEnd = searchParams.get("end");
    const start = DATE_RE.test(qsStart || "") ? qsStart : def.start;
    const end = DATE_RE.test(qsEnd || "") ? qsEnd : def.end;

    const seqIds = activeSequences().map((s) => String(s.id));
    const key = `${start}|${end}|${seqIds.join(",")}`;

    const hit = cacheStore.get(key);
    if (!fresh && hit && Date.now() - hit.at < TTL_MS) {
      return NextResponse.json({ ...hit.data, cached: true });
    }

    const [emails, enrolledPairs] = await Promise.all([
      searchSequenceEmails({ sequenceIds: seqIds, start, end }),
      Promise.all(seqIds.map((id) => countEnrolled(id, start, end).then((t) => [id, t]))),
    ]);
    const enrolledBySeq = Object.fromEntries(enrolledPairs);
    const bouncedIds = emails.filter((e) => e.status === "BOUNCED").map((e) => e.id);
    const bouncedContacts = await contactsForEmails(bouncedIds, CONTACT_PROPS);
    const metrics = buildMetrics(emails, bouncedContacts, enrolledBySeq);

    const payload = {
      window: { start, end },
      configuredSequences: activeSequences(),
      unconfigured: activeSequences().length === 0,
      ...metrics,
      cached: false,
    };

    cacheStore.set(key, { at: Date.now(), data: payload });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "s-maxage=900, stale-while-revalidate=1800" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || String(err) },
      { status: 500 }
    );
  }
}
