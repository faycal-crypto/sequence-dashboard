import { NextResponse } from "next/server";
import { searchSequenceEmails, resolveWindow } from "../../../lib/hubspot.js";
import { sequenceNameById } from "../../../lib/sequences.js";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Lists every sequence ID that sent emails in the window, with counts.
// Use this to match HubSpot sequence IDs to the names in lib/sequences.js.
export async function GET() {
  try {
    const { start, end } = resolveWindow();
    const emails = await searchSequenceEmails({ sequenceIds: [], start, end });

    const map = new Map();
    for (const e of emails) {
      if (!e.sequenceId) continue;
      const v = map.get(e.sequenceId) || { sent: 0, bounced: 0 };
      if (e.status === "SENT" || e.status === "BOUNCED") v.sent += 1;
      if (e.status === "BOUNCED") v.bounced += 1;
      map.set(e.sequenceId, v);
    }

    const sequences = [...map.entries()]
      .map(([id, v]) => ({
        id,
        knownName: sequenceNameById(id),
        sent: v.sent,
        bounced: v.bounced,
      }))
      .sort((a, b) => b.sent - a.sent);

    return NextResponse.json({ window: { start, end }, sequences });
  } catch (err) {
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
