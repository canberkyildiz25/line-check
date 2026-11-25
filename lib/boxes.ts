/**
 * Rectangles drawn as loose lines in a CAD file. CAD geometry is exact, so the
 * top and bottom of one box share their end points: group horizontal lines by
 * their ends, then check that vertical lines close each pair. Runs in
 * O(n log n), so a whole floor plan is fine.
 */

import type { Shape } from "./drawing";

export interface Seg {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layer: string;
}

export function boxesFromLines(segs: Seg[], tol: number, minSide: number): Shape[] {
  const q = (v: number) => Math.round(v / tol);
  const rows = new Map<string, { y: number; a: number; b: number; layer: string }[]>();
  const cols = new Map<number, { a: number; b: number }[]>();
  for (const s of segs) {
    if (Math.abs(s.y0 - s.y1) <= tol && Math.abs(s.x0 - s.x1) >= minSide) {
      const a = Math.min(s.x0, s.x1);
      const b = Math.max(s.x0, s.x1);
      const key = `${q(a)},${q(b)}`;
      const list = rows.get(key) ?? [];
      list.push({ y: (s.y0 + s.y1) / 2, a, b, layer: s.layer });
      rows.set(key, list);
    } else if (Math.abs(s.x0 - s.x1) <= tol && Math.abs(s.y0 - s.y1) >= minSide) {
      const key = q((s.x0 + s.x1) / 2);
      const list = cols.get(key) ?? [];
      list.push({ a: Math.min(s.y0, s.y1), b: Math.max(s.y0, s.y1) });
      cols.set(key, list);
    }
  }
  const side = (x: number, y0: number, y1: number) => {
    for (const k of [q(x) - 1, q(x), q(x) + 1]) for (const v of cols.get(k) ?? []) if (v.a <= y0 + tol * 2 && v.b >= y1 - tol * 2) return true;
    return false;
  };
  const out: Shape[] = [];
  for (const list of rows.values()) {
    if (list.length < 2) continue;
    list.sort((p, r) => p.y - r.y);
    for (let i = 0; i + 1 < list.length; i++) {
      const lo = list[i];
      const hi = list[i + 1];
      if (hi.y - lo.y < minSide) continue;
      if (side(lo.a, lo.y, hi.y) && side(lo.b, lo.y, hi.y)) out.push({ x: lo.a, y: lo.y, w: lo.b - lo.a, h: hi.y - lo.y, layer: lo.layer });
    }
  }
  return out;
}
