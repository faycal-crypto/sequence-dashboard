// ---------------------------------------------------------------------------
// CONFIG — active sequences to monitor (update monthly).
// id = numeric HubSpot sequence ID (end of the sequence URL, or /api/sequences).
// ---------------------------------------------------------------------------
export const SEQUENCES = [
  { id: "309023663", name: "BoB - Turnover at Scale (8 days)" },
  { id: "308980553", name: "GM Time Back - 10days" },
  { id: "309568312", name: "BoB - Back to school (9 days) YES Email" },
  { id: "309029788", name: "BoB - hotel staffing crisis (9 days)" },
  { id: "308028065", name: "Multilingual (7 Business Days)" },
  { id: "308047950", name: "One Ownership Group (7 days)" },
  { id: "309262881", name: "BoB - NRO's (10 days)" },
  { id: "309008424", name: "BoB - Car Retail (9 days)" },
  { id: "309569034", name: "BoB - Independant Boutique Operators (9days) YES Email" },
  { id: "308975914", name: "GM Time Back 10 day (NO EMAIL)" },
  { id: "309571361", name: "BoB - Back to school (9 days) NO Email" },
  { id: "309262883", name: "BoB - NRO's (10 days) NO EMAIL" },
  { id: "309570867", name: "BoB - Independant Boutique Operators (9days) NO Email" },
  { id: "309007744", name: "BoB - Car Retail (9 days) NO EMAIL" },
  { id: "309049630", name: "BoB - hotel staffing crisis (9 days) NO EMAIL" },
  { id: "309008471", name: "BoB - Turnover at Scale (9 days) NO EMAIL" },
  { id: "273686810", name: "[04-2025 COHORT 1] QSR/OTHER - HR/TALENT/RECRUITING/TECH" },
];

// ---------------------------------------------------------------------------
// SDR owners (verified HubSpot owner IDs).
// ---------------------------------------------------------------------------
export const SDRS = [
  { ownerId: "81971162", name: "Madison Cote" },
  { ownerId: "85942335", name: "Katrina Bernard" },
  { ownerId: "88906539", name: "Jon Scharfman" },
  { ownerId: "96344025", name: "Angelica Rogers" },
];

// ---------------------------------------------------------------------------
// SDR contact lists (update monthly). listId = number in the list URL:
// app.hubspot.com/contacts/<portal>/objectLists/<listId>/filters
// Requires the service-key scope `crm.lists.read`.
// ---------------------------------------------------------------------------
export const SDR_LISTS = [
  { listId: "4323", sdr: "Angelica Rogers", name: "[SDR] — Angelica — BoB Contacts August 26" },
  { listId: "4341", sdr: "Jon Scharfman", name: "[SDR] — Jon — BoB Contacts August 26" },
  { listId: "4350", sdr: "Katrina Bernard", name: "[SDR] — Katrina — BoB Contacts August 26" },
  { listId: "4330", sdr: "Madison Cote", name: "[SDR] — Madison — BoB Contacts August 26" },
];

export const SDR_BY_ID = Object.fromEntries(SDRS.map((s) => [s.ownerId, s.name]));

export function activeSequences() {
  return SEQUENCES.filter((s) => String(s.id || "").trim() !== "");
}

export function sequenceNameById(id) {
  const hit = SEQUENCES.find((s) => String(s.id) === String(id));
  return hit ? hit.name : `Sequence ${id}`;
}
