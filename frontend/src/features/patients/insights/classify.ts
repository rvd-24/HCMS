// Turns free-text diagnoses into (a) which body areas a patient's visits touch and
// (b) per-tooth findings from FDI tooth numbers ("caries in 11 and 21", "obturation … 25").
import type { Visit } from "@/lib/types";

export type Area = "teeth" | "heart" | "blood" | "lungs" | "brain" | "eye" | "body";

const AREA_RULES: [Area, RegExp][] = [
  [
    "teeth",
    /\b(tooth|teeth|dental|caries|carious|pulp|endodont|obturat|root canal|rct|gingiv|periodont|malocclusion|occlus|crowding|molar|premolar|canine|incisor|crown|composite|restoration|scaling|prophylaxis|extraction|impacted|pericoron|dry socket|orthodont|gutta|bmp|access opening|cbct|denture|implant|enamel)/i,
  ],
  ["heart", /\b(heart|cardi|hypertens|bp\s*\d|blood pressure|angina|arrhythm|palpitat|myocard|ecg|chest pain)/i],
  ["blood", /\b(blood|haemo|hemo|hba1c|glucose|sugar|diabet|anaemi|anemi|platelet|cbc|bleeding time|clotting|hiv|hbsag|hcv|lipid|cholesterol)/i],
  ["lungs", /\b(lung|asthma|cough|bronch|pneumon|respirat|copd|tuberculosis|wheez|breath|pharyng|throat)/i],
  ["brain", /\b(brain|migraine|headache|seizure|epilep|stroke|neuro|vertigo)/i],
  ["eye", /\b(eye|vision|cataract|glaucoma|conjunctiv|retina|myopia)/i],
];

export interface AreaHit {
  area: Area;
  visits: Visit[];
}

const text = (v: Visit) => `${v.diagnosis ?? ""} ${v.diagnosis ? "" : v.summary ?? ""}`.trim();

/** Areas ordered by how many visits mention them; "body" is always last as the overview. */
export function detectAreas(visits: Visit[]): AreaHit[] {
  const hits = new Map<Area, Visit[]>();
  for (const v of visits) {
    const t = `${text(v)} ${v.doctor?.specialty ?? ""}`;
    for (const [area, re] of AREA_RULES) if (re.test(t)) hits.set(area, [...(hits.get(area) ?? []), v]);
  }
  return [...[...hits.entries()].map(([area, vs]) => ({ area, visits: vs })).sort((a, b) => b.visits.length - a.visits.length), { area: "body" as Area, visits }];
}

/* ---------------- Teeth ---------------- */

export type ToothKind = "decay" | "endo" | "surgery" | "restored" | "other";

export const TOOTH_KINDS: { kind: ToothKind; label: string; color: string }[] = [
  // Validated categorical palette (dataviz validator, light mode). Order = legend order.
  { kind: "decay", label: "Decay", color: "#e0901b" },
  { kind: "endo", label: "Root canal", color: "#e5484d" },
  { kind: "surgery", label: "Extraction / surgery", color: "#7c5cdb" },
  { kind: "restored", label: "Restored", color: "#1ea468" },
  { kind: "other", label: "Other finding", color: "#3b82f6" },
];
export const KIND_COLOR = Object.fromEntries(TOOTH_KINDS.map((k) => [k.kind, k.color])) as Record<ToothKind, string>;

const KIND_RULES: [ToothKind, RegExp][] = [
  ["surgery", /extract|impact|dry socket|surgical|pericoron|wisdom/i],
  ["endo", /endodont|pulp|root canal|\brct\b|obturat|access opening|biomechanical|\bbmp\b|working length|periapical|abscess|gutta/i],
  ["decay", /carie|carious|cavity|decay/i],
  ["restored", /restor|composite|crown|filling|\bgic\b|amalgam|sealant|bridge/i],
];

export interface ToothEvent {
  kind: ToothKind;
  text: string;
  date: string | null;
  doctor: string | null;
  removed: boolean;
}

export interface TeethFindings {
  teeth: Map<number, ToothEvent[]>;
  gums: Visit[];
  alignment: Visit[];
}

const VALID = (n: number) => n >= 11 && n <= 48 && n % 10 >= 1 && n % 10 <= 8;

/** Remove numbers that look like teeth but aren't: dates, BP, sizes, lengths, %, times, files. */
function scrub(s: string) {
  return s
    .replace(/\d{4}-\d{2}-\d{2}/g, " ")
    .replace(/\d+\s*\/\s*\d+/g, " ")
    .replace(/(\d+\s*(?:&|and|,)\s*)*\d+(\.\d+)?\s*(mm|cm|mg|ml|%|min|sec|days?|hrs?|x)\b/gi, " ")
    .replace(/(#|size|file|no\.?|taper)\s*\d+/gi, " ")
    .replace(/\d+\.\d+/g, " ");
}

export function teethFindings(visits: Visit[]): TeethFindings {
  const teeth = new Map<number, ToothEvent[]>();
  const gums: Visit[] = [];
  const alignment: Visit[] = [];
  // Oldest first so each tooth's last event is its current state.
  const ordered = [...visits].sort((a, b) => (a.visit_date ?? "").localeCompare(b.visit_date ?? ""));
  for (const v of ordered) {
    const t = text(v);
    if (/gingiv|periodont|scaling|prophylaxis|bleeding gum/i.test(t)) gums.push(v);
    if (/malocclusion|crowding|orthodont|irregularly placed|class (i|ii|iii) molar/i.test(t)) alignment.push(v);
    for (const clause of t.split(/[.;]\s+|\n/)) {
      const nums = [...scrub(clause).matchAll(/\b([1-4][1-8])\b/g)].map((m) => Number(m[1])).filter(VALID);
      if (!nums.length) continue;
      const kind = KIND_RULES.find(([, re]) => re.test(clause))?.[0] ?? "other";
      const removed = kind === "surgery" && /extract/i.test(clause) && /done|completed|extracted|surgical/i.test(clause);
      for (const n of new Set(nums)) {
        teeth.set(n, [...(teeth.get(n) ?? []), { kind, text: clause.trim(), date: v.visit_date, doctor: v.doctor?.full_name ?? v.doctor_name_raw, removed }]);
      }
    }
  }
  return { teeth, gums, alignment };
}

const QUADRANT = ["", "Upper right", "Upper left", "Lower left", "Lower right"];
const TYPE = ["", "central incisor", "lateral incisor", "canine", "first premolar", "second premolar", "first molar", "second molar", "third molar (wisdom)"];
export const toothName = (n: number) => `${QUADRANT[Math.floor(n / 10)]} ${TYPE[n % 10]}`;
