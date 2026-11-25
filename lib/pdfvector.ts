/**
 * Vector content of a PDF page, for automatic detection: the closed outlines
 * drawn on it and where they sit, in the same pixel frame as the rendered page.
 * Works on pdf.js's operator list, so it runs in the browser and in Node.
 */

import type { Shape } from "./drawing";

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
const apply = (m: M, x: number, y: number) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** The op codes this reader needs, from pdf.js's OPS table. */
export interface PdfOps {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
}

/** pdf.js's DrawOPS inside a constructPath's path data. */
const MOVE = 0;
const LINE = 1;
const CURVE = 2;
const QUAD = 3;
const CLOSE = 4;

export interface PdfVectors {
  shapes: Shape[];
  /** Straight segments, kept to find rectangles drawn as four separate lines. */
  segments: number;
}

/**
 * @param ops   pdf.js OPS
 * @param list  page.getOperatorList() result
 * @param view  viewport.transform (PDF points → page pixels, y down)
 * @param height rendered page height in pixels; shapes come out with y up
 */
export function pdfVectors(ops: PdfOps, list: { fnArray: number[]; argsArray: unknown[] }, view: number[], height: number): PdfVectors {
  const shapes: Shape[] = [];
  const stack: M[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  const lines: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const V = view as M;

  const toPage = (x: number, y: number) => {
    const [ux, uy] = apply(ctm, x, y);
    const [px, py] = apply(V, ux, uy);
    return [px, height - py] as const;
  };
  const addPoly = (pts: (readonly [number, number])[]) => {
    if (pts.length < 3) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    const w = x1 - x0;
    const h = y1 - y0;
    // A thin filled box is a line drawn as an outline (some printers turn dashes into these).
    if (Math.min(w, h) < 3) {
      if (Math.max(w, h) >= 0.5) {
        if (w >= h) lines.push({ x0, y0: (y0 + y1) / 2, x1, y1: (y0 + y1) / 2 });
        else lines.push({ x0: (x0 + x1) / 2, y0, x1: (x0 + x1) / 2, y1 });
      }
      return;
    }
    // Small outlines (a dashed corner turned into an L) also give their straight edges.
    if (pts.length <= 12 && Math.max(w, h) < 40)
      for (let k = 1; k < pts.length; k++) lines.push({ x0: pts[k - 1][0], y0: pts[k - 1][1], x1: pts[k][0], y1: pts[k][1] });
    shapes.push({ x: x0, y: y0, w, h, layer: "pdf" });
  };

  for (let i = 0; i < list.fnArray.length; i++) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i] as unknown[];
    if (fn === ops.save) stack.push(ctm);
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm;
    else if (fn === ops.transform) ctm = mul(ctm, args as M);
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0] as M | null;
      if (m) ctm = mul(ctm, m);
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === ops.constructPath) {
      const data = (args?.[1] as ArrayLike<number>[] | undefined)?.[0];
      if (!data) continue;
      let pts: (readonly [number, number])[] = [];
      let start: readonly [number, number] | null = null;
      const flush = (closed: boolean) => {
        if (pts.length >= 3) {
          const a = pts[0], b = pts[pts.length - 1];
          if (closed || Math.hypot(a[0] - b[0], a[1] - b[1]) < 1) addPoly(pts);
        } else if (pts.length === 2) {
          lines.push({ x0: pts[0][0], y0: pts[0][1], x1: pts[1][0], y1: pts[1][1] });
        }
        pts = [];
        start = null;
      };
      for (let k = 0; k < data.length; ) {
        const op = data[k++];
        if (op === MOVE) {
          flush(false);
          start = toPage(data[k], data[k + 1]);
          pts.push(start);
          k += 2;
        } else if (op === LINE) {
          pts.push(toPage(data[k], data[k + 1]));
          k += 2;
        } else if (op === CURVE) {
          pts.push(toPage(data[k + 4], data[k + 5]));
          k += 6;
        } else if (op === QUAD) {
          pts.push(toPage(data[k + 2], data[k + 3]));
          k += 4;
        } else if (op === CLOSE) {
          if (start) pts.push(start);
          flush(true);
        } else break;
      }
      flush(false);
    }
  }
  shapes.push(...rectanglesFromLines(lines));
  return { shapes: dedupe(shapes), segments: lines.length };
}

/**
 * CAD programs often print a rectangle as four loose lines. Pair horizontal and
 * vertical segments whose ends meet into the boxes they close.
 */
function rectanglesFromLines(lines: { x0: number; y0: number; x1: number; y1: number }[]): Shape[] {
  const tol = 1.5;
  const rawH: { y: number; a: number; b: number }[] = [];
  const rawV: { x: number; a: number; b: number }[] = [];
  for (const l of lines) {
    if (Math.abs(l.y0 - l.y1) < tol) rawH.push({ y: (l.y0 + l.y1) / 2, a: Math.min(l.x0, l.x1), b: Math.max(l.x0, l.x1) });
    else if (Math.abs(l.x0 - l.x1) < tol) rawV.push({ x: (l.x0 + l.x1) / 2, a: Math.min(l.y0, l.y1), b: Math.max(l.y0, l.y1) });
  }
  // Dashed lines arrive as many short pieces on one line; join pieces with small gaps.
  // The pieces themselves stay too, so two boxes sharing a straight edge still close.
  const join = <T extends { a: number; b: number }>(list: T[], key: (s: T) => number, make: (k: number, a: number, b: number) => T) => {
    const out: T[] = [];
    const byKey = [...list].sort((p, q) => key(p) - key(q));
    // Cluster pieces that sit on the same line, then walk each cluster along its length.
    for (let i = 0; i < byKey.length; ) {
      let j = i + 1;
      while (j < byKey.length && key(byKey[j]) - key(byKey[i]) < tol) j++;
      const cluster = byKey.slice(i, j).sort((p, q) => p.a - q.a);
      const k0 = key(cluster[0]);
      let cur = cluster[0];
      let pieces = 0;
      for (const s of cluster.slice(1)) {
        if (s.a - cur.b <= 12) {
          cur = make(k0, cur.a, Math.max(cur.b, s.b));
          pieces++;
        } else {
          if (pieces > 0) out.push(cur);
          cur = s;
          pieces = 0;
        }
      }
      if (pieces > 0) out.push(cur);
      i = j;
    }
    return out;
  };
  const hs = [...rawH, ...join(rawH, (s) => s.y, (y, a, b) => ({ y, a, b }))].filter((s) => s.b - s.a > 4);
  const vs = [...rawV, ...join(rawV, (s) => s.x, (x, a, b) => ({ x, a, b }))].filter((s) => s.b - s.a > 4);
  if (hs.length * hs.length + vs.length > 4e6) return []; // too dense a sheet to pair cheaply
  // Ends of a dashed line can stop a dash short of the corner.
  const end = 14;
  const out: Shape[] = [];
  hs.sort((p, q) => p.y - q.y);
  for (let i = 0; i < hs.length; i++) {
    const bottom = hs[i];
    if (bottom.b - bottom.a < 3 * end) continue;
    for (let j = i + 1; j < hs.length; j++) {
      const top = hs[j];
      if (top.y - bottom.y < 3 * end || top.b - top.a < 3 * end) continue;
      if (Math.abs(top.a - bottom.a) > end || Math.abs(top.b - bottom.b) > end) continue;
      const x0 = Math.min(top.a, bottom.a);
      const x1 = Math.max(top.b, bottom.b);
      const side = (x: number) => vs.some((v) => Math.abs(v.x - x) < end && v.a <= bottom.y + end && v.b >= top.y - end);
      if (side(x0) && side(x1)) {
        out.push({ x: x0, y: bottom.y, w: x1 - x0, h: top.y - bottom.y, layer: "pdf" });
        break;
      }
    }
  }
  return out;
}

function dedupe(shapes: Shape[]): Shape[] {
  const seen = new Set<string>();
  return shapes.filter((s) => {
    const key = [s.x, s.y, s.w, s.h].map((n) => Math.round(n)).join(",");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** The drawing scale printed on a sheet ("1/50", "1:50", "SCALE 1:20"), most common first. */
export function printedScale(texts: string[]): number | null {
  const counts = new Map<number, number>();
  for (const t of texts) {
    for (const m of t.matchAll(/(?:^|[^\d/:])1\s*[/:]\s*(\d{1,3})(?![\d/:.,])/g)) {
      const n = Number(m[1]);
      if ([10, 20, 25, 30, 50, 75, 100, 200].includes(n)) counts.set(n, (counts.get(n) ?? 0) + (/(scale|[öo]l[çc]ek)/i.test(t) ? 5 : 1));
    }
  }
  const best = [...counts.entries()].sort((p, q) => q[1] - p[1])[0];
  return best ? best[0] : null;
}
