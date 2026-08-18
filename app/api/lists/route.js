import { NextResponse } from "next/server";
import { listMembershipIds, batchReadContacts } from "../../../lib/hubspot.js";
import { SDR_LISTS } from "../../../lib/sequences.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TTL_MS = 30 * 60 * 1000; // 30 min
let cache = { at: 0, data: null };

const PROPS = [
  "email",
  "firstname",
  "lastname",
  "legit_email",
  "hs_email_hard_bounce_reason_enum",
  "hs_email_bad_address",
  "hs_email_bounce",
];

function priorBounceInfo(c) {
  const reasons = [];
  if (c.hs_email_hard_bounce_reason_enum) reasons.push(`hard bounce: ${c.hs_email_hard_bounce_reason_enum}`);
  if (c.hs_email_bad_address === "true") reasons.push("invalid address");
  const cnt = Number(c.hs_email_bounce || 0);
  if (cnt > 0) reasons.push(`${cnt} marketing bounce${cnt > 1 ? "s" : ""}`);
  return { priorBounce: reasons.length > 0, reason: reasons.join(" · ") || "—" };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fresh = searchParams.get("fresh") === "1";
    if (!fresh && cache.data && Date.now() - cache.at < TTL_MS) {
      return NextResponse.json({ ...cache.data, cached: true });
    }

    if (!SDR_LISTS.length) {
      return NextResponse.json({ error: "No SDR lists configured in lib/sequences.js" }, { status: 400 });
    }

    const perList = await Promise.all(
      SDR_LISTS.map(async (l) => {
        const ids = await listMembershipIds(l.listId);
        const contacts = await batchReadContacts(ids, PROPS);
        return { list: l, contacts: [...contacts.values()] };
      })
    );

    const unknown = [];
    const yes = [];
    const lists = [];
    for (const { list, contacts } of perList) {
      lists.push({ listId: list.listId, sdr: list.sdr, name: list.name, total: contacts.length });
      for (const c of contacts) {
        const base = {
          contactId: c.id,
          email: c.email || "—",
          name: [c.firstname, c.lastname].filter(Boolean).join(" ") || "—",
          sdr: list.sdr,
        };
        const legit = c.legit_email; // 'true' | 'false' | undefined/empty
        if (legit === "true") {
          const pb = priorBounceInfo(c);
          yes.push({ ...base, priorBounce: pb.priorBounce, reason: pb.reason });
        } else if (legit !== "false") {
          unknown.push(base); // empty / unknown
        }
      }
    }

    unknown.sort((a, b) => a.sdr.localeCompare(b.sdr) || a.name.localeCompare(b.name));
    yes.sort((a, b) => Number(b.priorBounce) - Number(a.priorBounce) || a.sdr.localeCompare(b.sdr));

    const payload = {
      generatedAt: new Date().toISOString(),
      lists,
      counts: { unknown: unknown.length, yes: yes.length },
      unknown,
      yes,
      cached: false,
    };
    cache = { at: Date.now(), data: payload };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
