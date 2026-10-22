// Teeth mentioned in free-text visit notes, by FDI number (11–48 permanent, 51–85 primary).
// The notes are handwriting transcribed by AI, so this is a best-effort reading: numbers
// that are clearly measurements, dates, sizes or readings are skipped.
import type { Visit } from "./types";

const QUADRANT = ["", "Upper right", "Upper left", "Lower left", "Lower right"];
const PERMANENT = ["", "central incisor", "lateral incisor", "canine", "first premolar", "second premolar", "first molar", "second molar", "third molar"];
const PRIMARY = ["", "central incisor", "lateral incisor", "canine", "first molar", "second molar"];

export function isTooth(n: number) {
  const q = Math.floor(n / 10);
  const i = n % 10;
  return (q >= 1 && q <= 4 && i >= 1 && i <= 8) || (q >= 5 && q <= 8 && i >= 1 && i <= 5);
}

/** Where a tooth sits on the permanent chart (primary 85 → position 45). */
export function chartPosition(n: number) {
  const q = Math.floor(n / 10);
  return q >= 5 ? (q - 4) * 10 + (n % 10) : n;
}

export function toothName(n: number) {
  const q = Math.floor(n / 10);
  const i = n % 10;
  if (q >= 5) return `${QUADRANT[q - 4]} primary ${PRIMARY[i]}`;
  return `${QUADRANT[q]} ${PERMANENT[i]}`;
}

// Optional hyphen so ages like "33-year-old" aren't read as tooth 33.
const UNIT_AFTER = /^\s*-?\s*(mm|cm|ml|mg|%|°|min|sec|s\b|hrs?|days?|weeks?|months?|years?|yrs?|x|mmhg|bpm|units?|gauge|g\b)/i;
const NOT_BEFORE = /(#|size|no\.?|number|file|bp|hba1c|age|aged|time|\dx)\s*$/i;

export function teethInText(text: string | null | undefined): number[] {
  if (!text) return [];
  const found = new Set<number>();
  for (const m of text.matchAll(/(?<![\d/:#]|\d[.-])(\d{2})(?!\d|[./:-]\d)/g)) {
    const n = Number(m[1]);
    if (!isTooth(n)) continue;
    const start = m.index ?? 0;
    const before = text.slice(Math.max(0, start - 8), start);
    const after = text.slice(start + 2, start + 10);
    if (UNIT_AFTER.test(after) || NOT_BEFORE.test(before)) continue;
    found.add(n);
  }
  return [...found];
}

export interface ToothRecord {
  /** Number as written in the notes (may be a primary tooth). */
  fdi: number;
  /** Position on the permanent chart. */
  position: number;
  visits: Visit[];
}

/** Teeth mentioned across a patient's visits, keyed by chart position, newest visit first. */
export function toothRecords(visits: Visit[]): Map<number, ToothRecord> {
  const map = new Map<number, ToothRecord>();
  const sorted = [...visits].sort((a, b) => (b.visit_date ?? "").localeCompare(a.visit_date ?? ""));
  for (const v of sorted) {
    for (const fdi of teethInText([v.diagnosis, v.summary].filter(Boolean).join(" "))) {
      const position = chartPosition(fdi);
      const rec = map.get(position) ?? { fdi, position, visits: [] };
      if (!rec.visits.includes(v)) rec.visits.push(v);
      map.set(position, rec);
    }
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* Tooth status (charting)                                             */
/* ------------------------------------------------------------------ */

/** Where a tooth stands after everything in the notes, most significant first. */
export type ToothStatus = "implant" | "missing" | "crown" | "rct" | "filled" | "caries" | "noted";

export const TOOTH_STATUS: Record<ToothStatus, { label: string; done: string; rank: number }> = {
  implant: { label: "Implant", done: "Implant placed", rank: 6 },
  missing: { label: "Missing", done: "Extracted", rank: 5 },
  crown: { label: "Crown", done: "Crown placed", rank: 4 },
  rct: { label: "Root canal", done: "Root canal treated", rank: 3 },
  filled: { label: "Filled", done: "Restored", rank: 2 },
  caries: { label: "Decay", done: "Decay noted", rank: 1 },
  noted: { label: "Noted", done: "Mentioned in notes", rank: 0 },
};

// Checked in this order; a piece of text gets the first that matches.
const STATUS_WORDS: [Exclude<ToothStatus, "noted">, RegExp][] = [
  ["implant", /\bimplants?\b/i],
  ["missing", /extract|exodontia|\bmissing\b|edentulous|\bsocket\b/i],
  ["rct", /obturat|root canal|\brct\b|endodont|access opening|pulpectomy|biomechanical|working length|\bbmp\b|gutta/i],
  ["crown", /\bcrowns?\b|\bbridge\b/i],
  ["filled", /composite|restor|filling|amalgam|\bgic\b|sealant/i],
  ["caries", /caries|carious|decay|cavit/i],
];
const PLANNED = /\b(plann?ed|plan|advised?|recommended|referred|to be done|scheduled)\b/i;
const DONE = /\b(done|completed?|placed|performed|healed|intact|extracted)\b/i;

export interface ToothFinding {
  date: string | null;
  status: ToothStatus;
  planned: boolean;
  /** The clause it came from, for the tooth's history. */
  text: string;
}

export interface ToothChartEntry {
  status: ToothStatus;
  /** Visit date of the finding that set the status. */
  since: string | null;
  /** Work planned or advised for the tooth and not yet recorded as done ("noted" = review/imaging advised). */
  planned: ToothStatus | null;
  findings: ToothFinding[];
}

const statusOf = (text: string) => STATUS_WORDS.find(([, re]) => re.test(text))?.[0] ?? null;

/** Findings per FDI tooth in one note, in reading order. Each clause is split at commas and
 *  "and"; a tooth in a piece without a keyword takes the nearest keyword before it, so
 *  "caries in 11 and 21" marks both while "composite on 21 and access opening in 11" doesn't mix. */
function findingsIn(text: string, date: string | null): [number, ToothFinding][] {
  const out: [number, ToothFinding][] = [];
  for (const clause of text.split(/[;\n]|\.(?=\s|$)/)) {
    const pieces = clause.split(/,|&|\band\b/i).map((p) => ({ p, teeth: teethInText(p), status: statusOf(p) }));
    if (!pieces.some((x) => x.teeth.length)) continue;
    const planned = PLANNED.test(clause);
    pieces.forEach((x, i) => {
      if (!x.teeth.length) return;
      const near = x.status ?? pieces.slice(0, i).reverse().find((y) => y.status)?.status ?? null;
      for (const t of x.teeth)
        out.push([t, { date, status: near ?? "noted", planned: planned && !DONE.test(x.p), text: clause.trim() }]);
    });
  }
  return out;
}

/** Status of every tooth named in the notes, keyed by chart position, built oldest visit first. */
export function toothChart(visits: Visit[]): Map<number, ToothChartEntry> {
  const chart = new Map<number, ToothChartEntry>();
  const sorted = [...visits].sort((a, b) => (a.visit_date ?? "").localeCompare(b.visit_date ?? "") || a.created_at.localeCompare(b.created_at));
  for (const v of sorted) {
    for (const [fdi, f] of findingsIn([v.diagnosis, v.summary].filter(Boolean).join(". "), v.visit_date)) {
      const pos = chartPosition(fdi);
      const e = chart.get(pos) ?? { status: "noted" as ToothStatus, since: null, planned: null, findings: [] };
      // The diagnosis and the AI summary often say the same thing; keep one finding per kind per visit.
      if (!e.findings.some((x) => x.date === f.date && x.status === f.status && x.planned === f.planned)) e.findings.push(f);
      if (f.planned) e.planned = f.status;
      else {
        if (TOOTH_STATUS[f.status].rank > TOOTH_STATUS[e.status].rank) [e.status, e.since] = [f.status, f.date];
        if (e.planned && (e.planned === f.status || e.planned === "noted") && f.status !== "noted") e.planned = null;
      }
      chart.set(pos, e);
    }
  }
  return chart;
}

const DENTAL = /dental|dentist|dentistry|oral|maxillofacial|orthodont|endodont|periodont|prosthodont|pedodont|conservative/i;

/** Which anatomy view fits this patient's care: dental clinics open on the teeth. */
export function isDentalCare(visits: Visit[], extra: (string | null | undefined)[] = []) {
  return [...visits.flatMap((v) => [v.clinic_name, v.doctor?.specialty]), ...extra].some((s) => !!s && DENTAL.test(s));
}
