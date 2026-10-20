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

const UNIT_AFTER = /^\s*(mm|cm|ml|mg|%|°|min|sec|s\b|hrs?|days?|weeks?|months?|years?|yrs?|x|mmhg|bpm|units?|gauge|g\b)/i;
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

const DENTAL = /dental|dentist|dentistry|oral|maxillofacial|orthodont|endodont|periodont|prosthodont|pedodont|conservative/i;

/** Which anatomy view fits this patient's care: dental clinics open on the teeth. */
export function isDentalCare(visits: Visit[], extra: (string | null | undefined)[] = []) {
  return [...visits.flatMap((v) => [v.clinic_name, v.doctor?.specialty]), ...extra].some((s) => !!s && DENTAL.test(s));
}
