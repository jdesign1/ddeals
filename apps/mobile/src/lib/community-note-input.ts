export const MAX_NOTE_BODY_LENGTH = 500;
export const MAX_NOTE_AGE_DAYS = 365;
export const MAX_REQUEST_BYTES = 8192;
export const BLOCKED_NOTE_MESSAGE = "We couldn’t send this tip. It may contain language or information we can’t publish. Please remove links, contact details, or inappropriate language, then try again.";

const STORE_NAMES: Record<string, string> = {
  newworld: "New World",
  paknsave: "PAK'nSAVE",
  woolworths: "Woolworths",
  foursquare: "Four Square",
  supervalue: "SuperValue",
  chemistwarehouse: "Chemist Warehouse",
};

const REGION_CODES = new Set([
  "northland",
  "auckland",
  "waikato",
  "bay_of_plenty",
  "gisborne",
  "hawkes_bay",
  "taranaki",
  "manawatu_whanganui",
  "wellington",
  "tasman",
  "nelson",
  "marlborough",
  "west_coast",
  "canterbury",
  "otago",
  "southland",
]);

const CONTENT_RESTRICTIONS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export interface ParsedCommunityNoteInput {
  sourceStoreId: string | null;
  price: number | null;
  observedOn: string | null;
  regionCode: string | null;
  body: string | null;
}

export type CommunityNoteInputResult =
  | { ok: true; value: ParsedCommunityNoteInput }
  | { ok: false; message: string; status: number };

function nzToday(): string {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Pacific/Auckland",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parsePrice(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(value.trim())) return undefined;
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 100000) return undefined;
  if (Math.abs(raw * 100 - Math.round(raw * 100)) > 0.0001) return undefined;
  return Math.round(raw * 100) / 100;
}

function parseBody(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length > MAX_NOTE_BODY_LENGTH || CONTENT_RESTRICTIONS.test(trimmed)) return undefined;
  return trimmed || null;
}

export function parseCommunityNoteInput(payload: Record<string, unknown>): CommunityNoteInputResult {
  const sourceStoreId = payload.sourceStoreId === null || payload.sourceStoreId === undefined || payload.sourceStoreId === ""
    ? null
    : typeof payload.sourceStoreId === "string"
      ? payload.sourceStoreId.trim().toLowerCase()
      : undefined;
  const observedOn = payload.observedOn === null || payload.observedOn === undefined || payload.observedOn === ""
    ? null
    : typeof payload.observedOn === "string"
      ? payload.observedOn.trim()
      : undefined;
  const regionCode = payload.regionCode === null || payload.regionCode === undefined || payload.regionCode === ""
    ? null
    : typeof payload.regionCode === "string"
      ? payload.regionCode.trim().toLowerCase()
      : undefined;
  const body = parseBody(payload.body);
  const price = parsePrice(payload.price);
  const today = nzToday();

  if (sourceStoreId === undefined || (sourceStoreId !== null && !STORE_NAMES[sourceStoreId])) {
    return { ok: false, message: "Choose a supermarket from the list.", status: 400 };
  }
  if (price === undefined) return { ok: false, message: "Enter a valid price with up to two decimal places.", status: 400 };
  if (observedOn === undefined) return { ok: false, message: "Choose a valid date.", status: 400 };
  if (observedOn !== null) {
    if (!validDate(observedOn)) return { ok: false, message: "Choose a valid date.", status: 400 };
    if (observedOn > today) return { ok: false, message: "The date cannot be in the future.", status: 400 };
    const oldestAllowed = new Date(`${today}T00:00:00Z`);
    oldestAllowed.setUTCDate(oldestAllowed.getUTCDate() - MAX_NOTE_AGE_DAYS);
    if (Date.parse(`${observedOn}T00:00:00Z`) < oldestAllowed.getTime()) {
      return { ok: false, message: "Please choose a date within the last year.", status: 400 };
    }
  }
  if (regionCode !== null && (regionCode === undefined || !REGION_CODES.has(regionCode))) {
    return { ok: false, message: "Choose a region from the list.", status: 400 };
  }
  if (body === undefined) {
    const rawBody = typeof payload.body === "string" ? payload.body.trim() : "";
    if (rawBody.length > MAX_NOTE_BODY_LENGTH) return { ok: false, message: "Shorten your note to 500 characters or fewer.", status: 400 };
    return { ok: false, message: BLOCKED_NOTE_MESSAGE, status: 422 };
  }

  return { ok: true, value: { sourceStoreId, price, observedOn, regionCode, body } };
}
