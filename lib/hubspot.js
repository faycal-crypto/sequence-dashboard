const BASE = "https://api.hubapi.com";

function token() {
  const t = process.env.HUBSPOT_TOKEN;
  if (!t) throw new Error("HUBSPOT_TOKEN is not set");
  return t;
}

async function hub(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    // never cache upstream; caching is handled at the route level
    cache: "no-store",
  });
  if (res.status === 429) {
    // simple backoff on rate limit
    await new Promise((r) => setTimeout(r, 1500));
    return hub(path, { method, body });
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot ${method} ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

// Convert YYYY-MM-DD to epoch millis (UTC). `endOfDay` pushes to 23:59:59.999.
export function toMs(dateStr, endOfDay = false) {
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  return Date.parse(`${dateStr}${suffix}`);
}

export function resolveWindow() {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const defaultStart = `${yyyy}-${mm}-01`;
  const defaultEnd = now.toISOString().slice(0, 10);
  const start = (process.env.WINDOW_START || "").trim() || defaultStart;
  const end = (process.env.WINDOW_END || "").trim() || defaultEnd;
  return { start, end };
}

// Fetch all sequence emails in [start,end] for the given sequence IDs.
// Returns [{ id, sequenceId, status, ownerId, to, createdate }]
export async function searchSequenceEmails({ sequenceIds, start, end }) {
  const filters = [
    { propertyName: "hs_email_direction", operator: "EQ", value: "EMAIL" },
    {
      propertyName: "hs_createdate",
      operator: "BETWEEN",
      value: String(toMs(start)),
      highValue: String(toMs(end, true)),
    },
  ];
  if (sequenceIds && sequenceIds.length) {
    filters.push({
      propertyName: "hs_sequence_id",
      operator: "IN",
      values: sequenceIds.map(String),
    });
  } else {
    filters.push({ propertyName: "hs_sequence_id", operator: "HAS_PROPERTY" });
  }

  const out = [];
  let after = undefined;
  do {
    const body = {
      filterGroups: [{ filters }],
      properties: [
        "hs_sequence_id",
        "hs_email_status",
        "hs_email_to_email",
        "hubspot_owner_id",
        "hs_createdate",
      ],
      sorts: [{ propertyName: "hs_createdate", direction: "DESCENDING" }],
      limit: 100,
      after,
    };
    const data = await hub("/crm/v3/objects/emails/search", {
      method: "POST",
      body,
    });
    for (const r of data.results || []) {
      const p = r.properties || {};
      out.push({
        id: r.id,
        sequenceId: p.hs_sequence_id || null,
        status: p.hs_email_status || null,
        ownerId: p.hubspot_owner_id || null,
        to: p.hs_email_to_email || null,
        createdate: p.hs_createdate || null,
      });
    }
    after = data.paging?.next?.after;
  } while (after);
  return out;
}

// For a set of email IDs, resolve the associated contact and read the
// requested contact properties. Returns Map<emailId, contact>.
export async function contactsForEmails(emailIds, props) {
  const result = new Map();
  if (!emailIds.length) return result;

  // 1) email -> contact associations (batched, 100 per call)
  const emailToContact = new Map();
  for (let i = 0; i < emailIds.length; i += 100) {
    const chunk = emailIds.slice(i, i + 100);
    const data = await hub(
      "/crm/v4/associations/emails/contacts/batch/read",
      { method: "POST", body: { inputs: chunk.map((id) => ({ id })) } }
    );
    for (const row of data.results || []) {
      const contactId = row.to?.[0]?.toObjectId;
      if (contactId) emailToContact.set(row.from.id, String(contactId));
    }
  }

  // 2) batch-read the unique contacts
  const contactIds = [...new Set([...emailToContact.values()])];
  const contactProps = new Map();
  for (let i = 0; i < contactIds.length; i += 100) {
    const chunk = contactIds.slice(i, i + 100);
    const data = await hub("/crm/v3/objects/contacts/batch/read", {
      method: "POST",
      body: { properties: props, inputs: chunk.map((id) => ({ id })) },
    });
    for (const r of data.results || []) {
      contactProps.set(String(r.id), { id: r.id, ...(r.properties || {}) });
    }
  }

  // 3) stitch back to email IDs
  for (const [emailId, contactId] of emailToContact.entries()) {
    const c = contactProps.get(contactId);
    if (c) result.set(emailId, c);
  }
  return result;
}

// Enrolled contact count for a sequence in [start,end] — matches HubSpot's
// "Enrolled" figure, using the contact property hs_latest_sequence_enrolled.
export async function countEnrolled(seqId, start, end) {
  const body = {
    filterGroups: [{
      filters: [
        { propertyName: "hs_latest_sequence_enrolled", operator: "EQ", value: String(seqId) },
        {
          propertyName: "hs_latest_sequence_enrolled_date",
          operator: "BETWEEN",
          value: String(toMs(start)),
          highValue: String(toMs(end, true)),
        },
      ],
    }],
    limit: 1,
  };
  const data = await hub("/crm/v3/objects/contacts/search", { method: "POST", body });
  return data.total || 0;
}

// All contact record IDs that are members of a HubSpot list (requires crm.lists.read).
export async function listMembershipIds(listId) {
  const ids = [];
  let after = undefined;
  do {
    const q = new URLSearchParams({ limit: "100" });
    if (after) q.set("after", after);
    const data = await hub(`/crm/v3/lists/${listId}/memberships?${q.toString()}`);
    for (const r of data.results || []) ids.push(String(r.recordId));
    after = data.paging?.next?.after;
  } while (after);
  return ids;
}

// Batch-read contacts by ID. Returns Map<contactId, {id, ...props}>.
export async function batchReadContacts(ids, props) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const data = await hub("/crm/v3/objects/contacts/batch/read", {
      method: "POST",
      body: { properties: props, inputs: chunk.map((id) => ({ id })) },
    });
    for (const r of data.results || []) out.set(String(r.id), { id: r.id, ...(r.properties || {}) });
  }
  return out;
}
