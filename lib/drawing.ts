/**
 * One shape for every uploaded plan, whatever it came from. Coordinates are
 * the drawing's own units with y pointing up (CAD convention); rasters are
 * mapped so that pixel (px, py) sits at (px, height - py).
 */

import type { ApplianceKind } from "./rules";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface DrawingText {
  x: number;
  y: number;
  h: number;
  value: string;
}

export interface Shape {
  x: number;
  y: number;
  w: number;
  h: number;
  layer: string;
  /** The block name when the shape is a block's footprint. */
  block?: string;
}

export interface Hint {
  kind: ApplianceKind | "hood";
  label: string;
  text: string;
  x: number;
  y: number;
  /** Sizes read from the text, in the drawing's units when they look like a size (e.g. 4500*2470*500). */
  dims?: number[];
}

export interface Drawing {
  source: "dwg" | "dxf" | "pdf" | "image";
  name: string;
  /** Where most of the geometry sits; stray far-away objects are left out. */
  bounds: Bounds;
  /** Vector drawings: one path per layer. */
  layers: { name: string; d: string }[];
  /** Raster drawings (PDF pages, images): the picture and its size in pixels. */
  image?: { href: string; width: number; height: number };
  texts: DrawingText[];
  /** Closed outlines and block footprints (vector drawings), for automatic detection. */
  shapes: Shape[];
  hints: Hint[];
  /** Inches per drawing unit, if the file says or the extents strongly suggest it. */
  unitGuess: { inchesPerUnit: number; label: string; sure: boolean; note?: string } | null;
  /** PDF pages: inches of paper per drawing unit, so a printed scale (1:50) gives real size. */
  paperInchesPerUnit?: number;
  /** Multi-page PDFs: which page is open, out of how many. */
  page?: { index: number; count: number };
  stats: { entities: number; skipped: number };
}

export const UNITS: { label: string; inchesPerUnit: number }[] = [
  { label: "millimetres", inchesPerUnit: 1 / 25.4 },
  { label: "centimetres", inchesPerUnit: 1 / 2.54 },
  { label: "metres", inchesPerUnit: 100 / 2.54 },
  { label: "inches", inchesPerUnit: 1 },
  { label: "feet", inchesPerUnit: 12 },
];

/* ------------------------------------------------------------- geometry */

export type M = [a: number, b: number, c: number, d: number, e: number, f: number];
export const I: M = [1, 0, 0, 1, 0, 0];

/** m1 · m2 (apply m2 first). */
export const mul = (m1: M, m2: M): M => [
  m1[0] * m2[0] + m1[2] * m2[1],
  m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3],
  m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
  m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];

export const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export const insertMatrix = (x: number, y: number, sx: number, sy: number, rot: number, bx: number, by: number): M => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  // translate(x,y) · rotate · scale · translate(-base)
  return mul([c * sx, s * sx, -s * sy, c * sy, x, y], [1, 0, 0, 1, -bx, -by]);
};

/** Collects SVG path data per layer and keeps a sample of points for the bounds. */
export class PathSink {
  private paths = new Map<string, string[]>();
  private xs: number[] = [];
  private ys: number[] = [];
  private segments = 0;
  readonly cap: number;

  constructor(cap = 400_000) {
    this.cap = cap;
  }

  get full() {
    return this.segments > this.cap;
  }

  private sample(x: number, y: number) {
    if (this.xs.length < 60_000 || Math.random() < 0.05) {
      this.xs.push(x);
      this.ys.push(y);
    }
  }

  private add(layer: string, d: string) {
    let list = this.paths.get(layer);
    if (!list) this.paths.set(layer, (list = []));
    list.push(d);
  }

  polyline(layer: string, pts: [number, number][], closed = false) {
    if (pts.length < 2 || this.full) return;
    this.segments += pts.length;
    let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
    for (let i = 1; i < pts.length; i++) d += `L${r(pts[i][0])} ${r(pts[i][1])}`;
    if (closed) d += "Z";
    this.add(layer, d);
    pts.forEach(([x, y]) => this.sample(x, y));
  }

  /** An arc from a0 to a1 (radians, counter-clockwise) around (cx, cy), after the transform. */
  arc(layer: string, m: M, cx: number, cy: number, rad: number, a0: number, a1: number) {
    let sweep = a1 - a0;
    while (sweep <= 0) sweep += Math.PI * 2;
    const n = Math.max(6, Math.min(64, Math.ceil((sweep / (Math.PI * 2)) * 48)));
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (sweep * i) / n;
      pts.push(apply(m, cx + rad * Math.cos(a), cy + rad * Math.sin(a)));
    }
    this.polyline(layer, pts);
  }

  layers() {
    return [...this.paths.entries()].map(([name, list]) => ({ name, d: list.join("") }));
  }

  /** The 1st to 99th percentile box of the geometry, padded a little. */
  bounds(): Bounds {
    if (!this.xs.length) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
    const q = (arr: number[], p: number) => {
      const s = [...arr].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
    };
    const minX = q(this.xs, 0.01);
    const maxX = q(this.xs, 0.99);
    const minY = q(this.ys, 0.01);
    const maxY = q(this.ys, 0.99);
    const padX = (maxX - minX) * 0.04 || 10;
    const padY = (maxY - minY) * 0.04 || 10;
    return { minX: minX - padX, minY: minY - padY, maxX: maxX + padX, maxY: maxY + padY };
  }
}

const r = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n * 10) / 10 : Math.round(n * 1000) / 1000);

/** Expand a polyline with DXF bulges into points (arcs flattened). */
export function bulged(m: M, verts: { x: number; y: number; bulge?: number }[], closed: boolean): [number, number][] {
  const out: [number, number][] = [];
  const n = verts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p = verts[i];
    const q = verts[(i + 1) % n];
    out.push(apply(m, p.x, p.y));
    const b = p.bulge ?? 0;
    if (Math.abs(b) > 1e-6) {
      const theta = 4 * Math.atan(b);
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const chord = Math.hypot(dx, dy);
      if (chord > 0) {
        const rad = chord / (2 * Math.sin(Math.abs(theta) / 2));
        const sag = rad * Math.cos(Math.abs(theta) / 2);
        const side = (b > 0 ? 1 : -1) * (Math.abs(theta) < Math.PI ? 1 : -1);
        const cx = (p.x + q.x) / 2 + (-dy / chord) * sag * side;
        const cy = (p.y + q.y) / 2 + (dx / chord) * sag * side;
        const a0 = Math.atan2(p.y - cy, p.x - cx);
        const steps = Math.max(4, Math.ceil(Math.abs(theta) / (Math.PI / 16)));
        for (let k = 1; k < steps; k++) {
          const a = a0 + (theta * k) / steps;
          out.push(apply(m, cx + rad * Math.cos(a), cy + rad * Math.sin(a)));
        }
      }
    }
  }
  const tail = closed ? verts[0] : verts[n - 1];
  out.push(apply(m, tail.x, tail.y));
  return out;
}

/* ----------------------------------------------------------------- hints */

const RULES: { kind: Hint["kind"]; label: string; re: RegExp; not?: RegExp }[] = [
  { kind: "hood", label: "Hood", re: /davlumbaz|\bhood\b|canopy|kanopi/i, not: /ayd[ıi]nlatma|lighting|raf[ıi]|shelf|washer|bula[sş][ıi]k|dish|type/i },
  { kind: "fryer", label: "Fryer", re: /frit[oö]z|fryer|deep[- ]fat/i, not: /air fryer|stand|ayak/i },
  { kind: "wok", label: "Wok", re: /\bwok\b/i },
  { kind: "salamander", label: "Salamander", re: /salamand/i },
  { kind: "griddle", label: "Griddle", re: /griddle|pleyt|plaka [ıi]zgara|teppan|fry ?top/i },
  { kind: "charbroiler-charcoal", label: "Charcoal grill", re: /charcoal|k[oö]m[uü]r|robata/i, not: /oven|f[ıi]r[ıi]n|stand|ayak/i },
  { kind: "charbroiler-wood", label: "Wood-fired grill", re: /wood[- ]?fired|mesquite|odun/i, not: /oven|f[ıi]r[ıi]n|pizza/i },
  { kind: "charbroiler-lava", label: "Char-broiler", re: /lav ?ta[sş]|lava|char[- ]?broil|[ıi]zgara|grill/i, not: /yer [ıi]zgara|floor|sulu|griddle|plaka|stand|ayak|oven|f[ıi]r[ıi]n|salamand/i },
  { kind: "tilt-skillet", label: "Tilt skillet", re: /devrilir|tilting|braising|skillet|vario|bratt|kipp|multi ?function/i },
  // "OCAK-GAZLI", "PAELLA OCAGI", "YER OCAGI" (floor stock-pot burner): open gas burners, protected like a range top.
  { kind: "range", label: "Range", re: /kuzine|\brange\b|burner|ocak|ocag|[0-9] ?g[oö]z/i, not: /doğalgaz hatt|fırınlar|induction|indüksiyon|induksiyon|hood|stand|ayak|ocakba|ocak ba[sş]/i },
];

/** The appliance kind (or "hood") a piece of text names, if any. */
export function kindOf(text: string): Hint["kind"] | null {
  // Block names glue words with underscores ("RANGE_900"); read them as spaces.
  // Turkish capitals: "FRİTÖZ", "KUZİNE" carry a dotted İ that /i does not fold to i.
  const t = text.replace(/_+/g, " ").replace(/İ/g, "i");
  for (const rule of RULES) if (rule.re.test(t) && !rule.not?.test(t)) return rule.kind;
  return null;
}

/** Equipment names in the drawing's text become suggestions; a size like 4500*2470*500 is read too. */
export function findHints(texts: DrawingText[]): Hint[] {
  const out: Hint[] = [];
  const seen = new Set<string>();
  for (const t of texts) {
    const v = t.value.trim();
    if (v.length < 3 || v.length > 160) continue;
    const folded = v.replace(/İ/g, "i");
    for (const rule of RULES) {
      if (!rule.re.test(folded) || rule.not?.test(folded)) continue;
      const key = `${rule.kind}|${v.toLowerCase().replace(/\s+/g, " ")}`;
      if (seen.has(key)) break;
      seen.add(key);
      const m = v.match(/(\d{3,5})\s*[*x×]\s*(\d{3,5})(?:\s*[*x×]\s*(\d{2,5}))?/);
      out.push({ kind: rule.kind, label: rule.label, text: v, x: t.x, y: t.y, dims: m ? m.slice(1).filter(Boolean).map(Number) : undefined });
      break;
    }
    if (out.length > 60) break;
  }
  return out;
}

/** MTEXT keeps formatting codes inline; keep only what a reader would see. */
export function plainText(s: string) {
  return s
    .replace(/\\[PpXx]/g, " ")
    .replace(/\\[A-Za-z][^;\\{}]*;/g, "")
    .replace(/\\[LlOoKk]/g, "")
    .replace(/[{}]/g, "")
    .replace(/%%[dD]/g, "°")
    .replace(/%%[cC]/g, "Ø")
    .replace(/\s+/g, " ")
    .trim();
}

/** Guess the units from the extents of a plan whose file does not say. */
export function guessUnits(
  insUnits: number | undefined,
  b: Bounds,
  metric: boolean,
  blockSize?: number,
  named?: { inchesPerUnit: number; count: number },
): Drawing["unitGuess"] {
  const byCode: Record<number, number> = { 1: 0, 2: 4, 4: 0, 5: 1, 6: 2 };
  // Blocks named with their own size ("OCAK-GAZLI-120_93_25" drawn 120 wide) settle it outright.
  if (named && named.count >= 3) {
    const u = UNITS.find((x) => Math.abs(x.inchesPerUnit - named.inchesPerUnit) / x.inchesPerUnit < 0.02);
    if (u) {
      const declared = insUnits === 4 ? "millimetres" : insUnits === 5 ? "centimetres" : insUnits === 6 ? "metres" : insUnits === 1 ? "inches" : null;
      return {
        inchesPerUnit: u.inchesPerUnit,
        label: u.label,
        sure: declared === u.label,
        note: declared && declared !== u.label ? `The file says ${declared}, but ${named.count} equipment blocks are named with their size and drawn in ${u.label}.` : undefined,
      };
    }
  }
  // Equipment blocks are usually 30–200 cm across; if the declared unit makes them absurd, trust their size instead.
  const fits = (k: number) => blockSize !== undefined && blockSize * k >= 10 && blockSize * k <= 90;
  const bySize = blockSize !== undefined ? [UNITS[1], UNITS[0], UNITS[2], UNITS[3]].find((u) => fits(u.inchesPerUnit)) : undefined;
  if (insUnits && insUnits in byCode) {
    const u = insUnits === 1 ? UNITS[3] : insUnits === 2 ? UNITS[4] : insUnits === 4 ? UNITS[0] : insUnits === 5 ? UNITS[1] : UNITS[2];
    if (blockSize !== undefined && !fits(u.inchesPerUnit) && bySize)
      return { inchesPerUnit: bySize.inchesPerUnit, label: bySize.label, sure: false, note: `The file says ${u.label}, but its equipment blocks only make sense in ${bySize.label}.` };
    return { inchesPerUnit: u.inchesPerUnit, label: u.label, sure: true };
  }
  if (bySize) return { inchesPerUnit: bySize.inchesPerUnit, label: bySize.label, sure: false };
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
  if (!metric) return { inchesPerUnit: 1, label: "inches", sure: false };
  // A kitchen plan sheet is usually 5–60 m across.
  if (span > 4000) return { inchesPerUnit: UNITS[0].inchesPerUnit, label: "millimetres", sure: false };
  if (span > 400) return { inchesPerUnit: UNITS[1].inchesPerUnit, label: "centimetres", sure: false };
  return { inchesPerUnit: UNITS[2].inchesPerUnit, label: "metres", sure: false };
}
