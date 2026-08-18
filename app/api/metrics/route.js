import { NextResponse } from "next/server";
import {
  searchSequenceEmails,
  contactsForEmails,
  resolveWindow,
} from "../../../lib/hubspot.js";
import { buildMetrics } from "../../../lib/aggregate.js";
import { activeSequences } from "../../../lib/sequences.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TTL_MS = 15 * 60 * 1000; // 15 min
let cache = { key: null, at: 0, data: null };

const CONTACT_PROPS = [
  "email",
  "firstname",
  "lastname",
  "sdr_owner",
  "legit_email",
  "hubspot_owner_id",
];

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fresh = searchParams.get("fresh") === "1";

    const { start, end } = resolveWindow();
    const seqIds = activeSequences().map((s) => String(s.id));
    const key = `${start}|${end}|${seqIds.join(",")}`;

    if (!fresh && cache.data && cache.key === key && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }

    const emails = await searchSequenceEmails({ sequenceIds: seqIds, start, end });
    const bouncedIds = emails.filter((e) => e.status === "BOUNCED").map((e) => e.id);
    const bouncedContacts = await contactsForEmails(bouncedIds, CONTACT_PROPS);
    const metrics = buildMetrics(emails, bouncedContacts);

    const payload = {
      window: { start, end },
      configuredSequences: activeSequences(),
      unconfigured: activeSequences().length === 0,
      ...metrics,
      cached: false,
    };

    cache = { key, at: Date.now(), data: payload };
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
