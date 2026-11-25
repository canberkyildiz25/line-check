import type { Design, Result } from "./engine";
import type { Drawing } from "./drawing";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

export type Hood = Rect & { id: string; axis: "x" | "y"; flip: boolean };

/**
 * What has been placed on an uploaded drawing, in the drawing's own units (y up).
 * A kitchen can have several hoods; each is its own system. `hood` is only set on
 * the per-hood view that viewOf() returns.
 */
export interface Plan {
  drawing: Drawing;
  inchesPerUnit: number;
  unitsConfirmed: boolean;
  hoods: Hood[];
  hood?: Hood;
  items: (Rect & { id: string })[];
  ducts: (Pt & { id: string })[];
  cabinet?: Pt;
  pull?: Pt;
  gas?: Pt;
}

export const emptyPlan = (drawing: Drawing): Plan => ({
  drawing,
  inchesPerUnit: drawing.unitGuess?.inchesPerUnit ?? 1,
  unitsConfirmed: !!drawing.unitGuess?.sure,
  hoods: [],
  items: [],
  ducts: [],
});

const centreOf = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const within = (r: Rect, p: Pt, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

/** Index of the hood a point falls under (a little slack at the edges), or -1. */
export function hoodAt(plan: Plan, p: Pt): number {
  return plan.hoods.findIndex((h) => within(h, p, Math.max(h.w, h.h) * 0.05));
}

/** One hood as a plan of its own: only the appliances and ducts under it. */
export function viewOf(plan: Plan, i: number): Plan {
  const hood = plan.hoods[i];
  return {
    ...plan,
    hood,
    items: plan.items.filter((it) => hoodAt(plan, centreOf(it)) === i),
    ducts: plan.ducts.filter((d) => hoodAt(plan, d) === i),
  };
}

export const normRect = (a: Pt, b: Pt): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });

/** Distance along the hood from its left end (drawing units). */
export function along(hood: NonNullable<Plan["hood"]>, p: Pt) {
  const d = hood.axis === "x" ? p.x - hood.x : p.y - hood.y;
  const len = hood.axis === "x" ? hood.w : hood.h;
  return hood.flip ? len - d : d;
}

export const hoodLength = (h: NonNullable<Plan["hood"]>) => (h.axis === "x" ? h.w : h.h);
export const hoodDepth = (h: NonNullable<Plan["hood"]>) => (h.axis === "x" ? h.h : h.w);

/** The point on the hood's centre line at a given distance from its left end. */
export function pointAlong(hood: NonNullable<Plan["hood"]>, s: number): Pt {
  const len = hoodLength(hood);
  const d = hood.flip ? len - s : s;
  return hood.axis === "x" ? { x: hood.x + d, y: hood.y + hood.h / 2 } : { x: hood.x + hood.w / 2, y: hood.y + d };
}

/** Start and length of an appliance footprint along the hood. */
export function itemSpan(hood: NonNullable<Plan["hood"]>, r: Rect) {
  const a = along(hood, { x: r.x, y: r.y });
  const b = along(hood, { x: r.x + r.w, y: r.y + r.h });
  return { start: Math.min(a, b), length: Math.abs(b - a), depth: hood.axis === "x" ? r.h : r.w };
}

const manhattan = (a: Pt, b: Pt) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** The agent pipe as drawn: from the tank, square to the nearer hood end, then along the centre line. */
export function pipeRoute(plan: Plan): Pt[] | null {
  const { hood, cabinet } = plan;
  if (!hood || !cabinet) return null;
  const len = hoodLength(hood);
  const a = pointAlong(hood, 0);
  const b = pointAlong(hood, len);
  const near = manhattan(cabinet, a) <= manhattan(cabinet, b) ? a : b;
  const far = near === a ? b : a;
  const corner = hood.axis === "x" ? { x: cabinet.x, y: near.y } : { x: near.x, y: cabinet.y };
  return [cabinet, corner, near, far];
}

/** Bring what is on the plan into the design: hood length, positions, ducts, measured runs. */
export function applyPlan(design: Design, plan: Plan): Design {
  const { hood } = plan;
  if (!hood) return design;
  const k = plan.inchesPerUnit;
  // Rows: appliances whose centres sit more than 20 in. apart across the hood are back to back.
  const across = (r: Rect) => (hood.axis === "x" ? r.y + r.h / 2 : r.x + r.w / 2);
  // Salamanders hang above a range, so they join the nearest row instead of bridging two.
  const hangs = new Set(design.line.filter((a) => a.kind === "salamander").map((a) => a.id));
  const centres = plan.items.filter((i) => !hangs.has(i.id)).map((i) => ({ id: i.id, c: across(i) })).sort((p, q) => p.c - q.c);
  const rowOf = new Map<string, number>();
  let row = 0;
  centres.forEach((it, i) => {
    if (i > 0 && (it.c - centres[i - 1].c) * k > 20) row++;
    rowOf.set(it.id, row);
  });
  for (const i of plan.items.filter((x) => hangs.has(x.id))) {
    const near = centres.reduce<{ id: string; c: number } | null>((best, c) => (!best || Math.abs(c.c - across(i)) < Math.abs(best.c - across(i)) ? c : best), null);
    rowOf.set(i.id, near ? rowOf.get(near.id) ?? 0 : 0);
  }
  const line = design.line.map((a) => {
    const item = plan.items.find((i) => i.id === a.id);
    if (!item) return a;
    const s = itemSpan(hood, item);
    return { ...a, x: round(s.start * k), width: Math.max(6, round(s.length * k)), row: rowOf.get(a.id) ?? 0 };
  });
  const ducts = design.ducts.map((d) => {
    const p = plan.ducts.find((x) => x.id === d.id);
    return p ? { ...d, position: round(along(hood, p) * k) } : d;
  });
  const site: NonNullable<Design["site"]> = {};
  const route = pipeRoute(plan);
  if (route && line.length) {
    const toHood = manhattan(route[0], route[1]) + manhattan(route[1], route[2]);
    const entryAlong = along(hood, route[2]);
    const firstCentre = Math.min(...line.map((a) => Math.abs((a.x ?? 0) / k + a.width / k / 2 - entryAlong)));
    site.pipeToFirstNozzle = round((toHood + firstCentre) * k);
  }
  if (plan.cabinet && plan.pull) site.pullCable = round(manhattan(plan.cabinet, plan.pull) * k);
  if (plan.cabinet && plan.gas) site.gasCable = round(manhattan(plan.cabinet, plan.gas) * k);
  return {
    ...design,
    hood: { ...design.hood, length: round(hoodLength(hood) * k), depth: round(hoodDepth(hood) * k), lineOffset: 0 },
    line,
    ducts,
    site: Object.keys(site).length ? site : undefined,
  };
}

const round = (n: number) => Math.round(n * 10) / 10;

/** Where the result's nozzles and detectors fall on the plan. */
export function overlay(plan: Plan, result: Result) {
  const { hood } = plan;
  if (!hood) return { nozzles: [], detectors: [] };
  const k = plan.inchesPerUnit;
  return {
    nozzles: result.nozzles.map((n) => ({ ...pointAlong(hood, n.x / k), code: n.code, zone: n.zone, ref: n.ref })),
    detectors: result.detectors.map((d, i) => ({ ...pointAlong(hood, d.x / k), terminal: i === result.detectors.length - 1 })),
  };
}
