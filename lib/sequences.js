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
];

export const SDRS = [
  { ownerId: "81971162", name: "Madison Cote" },
  { ownerId: "85942335", name: "Katrina Bernard" },
  { ownerId: "88906539", name: "Jon Scharfman" },
  { ownerId: "96344025", name: "Angelica Rogers" },
];

export const SDR_BY_ID = Object.fromEntries(SDRS.map((s) => [s.ownerId, s.name]));

export function activeSequences() {
  return SEQUENCES.filter((s) => String(s.id || "").trim() !== "");
}

export function sequenceNameById(id) {
  const hit = SEQUENCES.find((s) => String(s.id) === String(id));
  return hit ? hit.name : `Sequence ${id}`;
}
