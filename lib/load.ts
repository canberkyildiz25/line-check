"use client";

/**
 * Read an uploaded plan in the browser. Nothing is sent anywhere: DWG goes
 * through LibreDWG compiled to WebAssembly, DXF through dxf-parser, PDF pages
 * through pdf.js, images as they are.
 */

import {
  I,
  PathSink,
  apply,
  bulged,
  findHints,
  guessUnits,
  insertMatrix,
  mul,
  plainText,
  type Drawing,
  type DrawingText,
  type Shape,
  type M,
} from "./drawing";
import { pdfVectors, printedScale, type PdfOps } from "./pdfvector";
import { boxesFromLines, type Seg } from "./boxes";

type P = { x: number; y: number };

/** A CAD entity reduced to what the plan view draws. */
type Ent =
  | { t: "line"; layer: string; a: P; b: P }
  | { t: "poly"; layer: string; v: (P & { bulge?: number })[]; closed: boolean }
  | { t: "circle"; layer: string; c: P; r: number }
  | { t: "arc"; layer: string; c: P; r: number; a0: number; a1: number }
  | { t: "ellipse"; layer: string; c: P; major: P; ratio: number; a0: number; a1: number }
  | { t: "points"; layer: string; v: P[] }
  | { t: "text"; layer: string; p: P; h: number; value: string }
  | { t: "insert"; layer: string; name: string; p: P; sx: number; sy: number; rot: number };

interface Cad {
  entities: Ent[];
  blocks: Map<string, { base: P; entities: Ent[] }>;
  insUnits?: number;
  metric: boolean;
}

export const ACCEPT = ".dwg,.dxf,.pdf,.png,.jpg,.jpeg,.webp";
export const MAX_BYTES = 60 * 1024 * 1024;

export async function loadFile(file: File, page?: number): Promise<Drawing> {
  if (file.size > MAX_BYTES) throw new Error("That file is over 60 MB. Save a smaller part of the drawing and try again.");
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (ext === "dwg") return fromCad(file.name, "dwg", await readDwg(file));
  if (ext === "dxf") return fromCad(file.name, "dxf", await readDxf(file));
  if (ext === "pdf") return readPdf(file, page);
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return readImage(file);
  throw new Error("Line Check reads DWG, DXF, PDF, PNG, JPG and WEBP files.");
}

/* ------------------------------------------------------------------ CAD */

type Box = { minX: number; minY: number; maxX: number; maxY: number };

function fromCad(name: string, source: "dwg" | "dxf", cad: Cad): Drawing {
  const sink = new PathSink();
  const texts: DrawingText[] = [];
  const shapes: Shape[] = [];
  /** Loose lines at the top level, for boxes drawn line by line. */
  const loose: Seg[] = [];
  let skipped = 0;

  // Footprints of the blocks being walked: every point drawn grows each open box.
  const open: Box[] = [];
  const touch = (pts: [number, number][]) => {
    if (!open.length) return;
    for (const [x, y] of pts)
      for (const b of open) {
        if (x < b.minX) b.minX = x;
        if (y < b.minY) b.minY = y;
        if (x > b.maxX) b.maxX = x;
        if (y > b.maxY) b.maxY = y;
      }
  };
  const draw = (layer: string, pts: [number, number][], closed = false) => {
    sink.polyline(layer, pts, closed);
    touch(pts);
  };
  const arcPts = (m: M, cx: number, cy: number, r: number, a0: number, a1: number): [number, number][] => {
    let sweep = a1 - a0;
    while (sweep <= 0) sweep += Math.PI * 2;
    const n = Math.max(6, Math.min(64, Math.ceil((sweep / (Math.PI * 2)) * 48)));
    return Array.from({ length: n + 1 }, (_, i) => apply(m, cx + r * Math.cos(a0 + (sweep * i) / n), cy + r * Math.sin(a0 + (sweep * i) / n)));
  };

  const walk = (ents: Ent[], m: M, parentLayer: string, depth: number) => {
    for (const e of ents) {
      if (sink.full) return;
      const layer = e.layer === "0" ? parentLayer : e.layer;
      switch (e.t) {
        case "line": {
          const a = apply(m, e.a.x, e.a.y);
          const b = apply(m, e.b.x, e.b.y);
          draw(layer, [a, b]);
          if (depth === 0 && loose.length < 200000) loose.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], layer });
          break;
        }
        case "poly": {
          const pts = bulged(m, e.v, e.closed);
          draw(layer, pts, e.closed);
          // Open polylines often draw one or two sides of a box; their straight edges join the loose lines.
          if (depth === 0 && !e.closed && pts.length <= 6 && loose.length < 200000)
            for (let i = 1; i < pts.length; i++) loose.push({ x0: pts[i - 1][0], y0: pts[i - 1][1], x1: pts[i][0], y1: pts[i][1], layer });
          const first = pts[0];
          const last = pts[pts.length - 1];
          const shut = e.closed || (pts.length > 3 && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6);
          if (shut && e.v.length >= 4 && e.v.length <= 12 && depth <= 2 && shapes.length < 30000) {
            const xs = pts.map((p) => p[0]);
            const ys = pts.map((p) => p[1]);
            const x = Math.min(...xs);
            const y = Math.min(...ys);
            const w = Math.max(...xs) - x;
            const h = Math.max(...ys) - y;
            let area = 0;
            for (let i = 0; i < pts.length; i++) {
              const [x1, y1] = pts[i];
              const [x2, y2] = pts[(i + 1) % pts.length];
              area += x1 * y2 - x2 * y1;
            }
            if (w > 0 && h > 0 && Math.abs(area / 2) / (w * h) > 0.8) shapes.push({ x, y, w, h, layer });
          }
          break;
        }
        case "points":
          draw(layer, e.v.map((p) => apply(m, p.x, p.y)));
          break;
        case "circle":
          draw(layer, arcPts(m, e.c.x, e.c.y, e.r, 0, Math.PI * 2));
          break;
        case "arc":
          draw(layer, arcPts(m, e.c.x, e.c.y, e.r, e.a0, e.a1));
          break;
        case "ellipse": {
          const len = Math.hypot(e.major.x, e.major.y);
          const rot = Math.atan2(e.major.y, e.major.x);
          const em = mul(m, insertMatrix(e.c.x, e.c.y, len, len * e.ratio, rot, 0, 0));
          draw(layer, arcPts(em, 0, 0, 1, e.a0, e.a1 <= e.a0 ? e.a1 + Math.PI * 2 : e.a1));
          break;
        }
        case "text": {
          const [x, y] = apply(m, e.p.x, e.p.y);
          const scale = Math.hypot(m[0], m[1]) || 1;
          const value = plainText(e.value);
          if (value) texts.push({ x, y, h: e.h * scale, value });
          break;
        }
        case "insert": {
          const block = cad.blocks.get(e.name);
          if (!block || depth > 5) {
            skipped++;
            break;
          }
          const track = depth <= 1;
          const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
          if (track) open.push(box);
          walk(block.entities, mul(m, insertMatrix(e.p.x, e.p.y, e.sx || 1, e.sy || 1, e.rot, block.base.x, block.base.y)), layer, depth + 1);
          if (track) {
            open.pop();
            if (Number.isFinite(box.minX) && box.maxX > box.minX && box.maxY > box.minY && shapes.length < 30000)
              shapes.push({ x: box.minX, y: box.minY, w: box.maxX - box.minX, h: box.maxY - box.minY, layer, block: e.name });
          }
          break;
        }
      }
    }
  };
  walk(cad.entities, I, "0", 0);

  const bounds = sink.bounds();
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) || 1;
  // Exact CAD geometry: a millionth of the drawing is plenty of slack; anything under 1/2000 of it is not equipment.
  const known = new Set(shapes.map((s) => [s.x, s.y, s.w, s.h].map((n) => Math.round(n / (span * 1e-5))).join(",")));
  for (const b of boxesFromLines(loose, span * 1e-6, span / 2000)) {
    const key = [b.x, b.y, b.w, b.h].map((n) => Math.round(n / (span * 1e-5))).join(",");
    if (!known.has(key) && shapes.length < 30000) {
      known.add(key);
      shapes.push(b);
    }
  }
  return {
    source,
    name,
    bounds,
    layers: sink.layers(),
    texts: texts.slice(0, 6000),
    shapes,
    hints: findHints(texts),
    unitGuess: guessUnits(cad.insUnits, bounds, cad.metric, medianBlock(shapes), namedUnits(shapes)),
    stats: { entities: cad.entities.length, skipped },
  };
}

/** Typical size of the drawing's equipment blocks, in drawing units (median longest side). */
/**
 * Kitchen consultants often name equipment blocks with their size: "OCAK-GAZLI-120_93_25",
 * "DAVLUMBAZ-ORTA TIP-400_240_50". When the drawn footprint matches the numbers in the name,
 * the drawing unit follows: values of 20–600 are centimetres, larger ones millimetres.
 */
export function namedUnits(shapes: Shape[]): { inchesPerUnit: number; count: number } | undefined {
  const ratios: number[] = [];
  const sizes: number[] = [];
  const seen = new Set<string>();
  for (const s of shapes) {
    if (!s.block || seen.has(s.block)) continue;
    const m = s.block.match(/(\d{2,4})\s*[_x*×]\s*(\d{2,4})/);
    if (!m) continue;
    seen.add(s.block);
    const named = [Number(m[1]), Number(m[2])].sort((a, b) => b - a);
    const drawn = [s.w, s.h].sort((a, b) => b - a);
    if (!named[0] || !drawn[0]) continue;
    const r = drawn[0] / named[0];
    // Both sides have to agree, or the name is not a size (a model number, a part code).
    if (Math.abs(drawn[1] / named[1] - r) / r > 0.12) continue;
    ratios.push(r);
    sizes.push(named[0]);
  }
  if (ratios.length < 3) return undefined;
  const mid = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const r = mid(ratios);
  const nameInches = mid(sizes) <= 600 ? 1 / 2.54 : 1 / 25.4;
  return { inchesPerUnit: nameInches / r, count: ratios.length };
}

function medianBlock(shapes: Shape[]): number | undefined {
  const sizes = shapes.filter((s) => s.block && !s.block.startsWith("*")).map((s) => Math.max(s.w, s.h)).sort((a, b) => a - b);
  if (sizes.length < 8) return undefined;
  return sizes[Math.floor(sizes.length / 2)];
}

/* DWG: LibreDWG in WebAssembly, loaded only when a DWG is dropped. */
async function readDwg(file: File): Promise<Cad> {
  return parseDwg(await file.arrayBuffer());
}

/** Exported for tests and tooling: read DWG bytes; wasmDir is where libredwg-web.wasm is served from. */
export async function dwgToDrawing(buf: ArrayBuffer, name: string, wasmDir = "/wasm/"): Promise<Drawing> {
  return fromCad(name, "dwg", await parseDwg(buf, wasmDir));
}

async function parseDwg(buf: ArrayBuffer, wasmDir = "/wasm/"): Promise<Cad> {
  const { LibreDwg, Dwg_File_Type } = await import("@mlightcad/libredwg-web");
  const lib = await LibreDwg.create(wasmDir);
  const tooMuch =
    "The in-browser DWG reader could not open this file; it is very large or uses parts of the format it does not handle. In your CAD program, copy the kitchen to a new drawing (WBLOCK) and save that as DWG or DXF, or print the kitchen sheet to PDF and use Suggest with AI.";
  let ptr: number | undefined;
  try {
    ptr = lib.dwg_read_data(buf, Dwg_File_Type.DWG);
  } catch {
    throw new Error(tooMuch);
  }
  if (ptr === undefined) throw new Error(tooMuch);
  try {
    const db = lib.convert(ptr);
    const map = (list: Record<string, unknown>[]): Ent[] => list.flatMap((e) => fromLibre(e));
    const blocks = new Map<string, { base: P; entities: Ent[] }>();
    for (const b of db.tables.BLOCK_RECORD.entries as unknown as Record<string, unknown>[]) {
      const nm = String(b.name ?? "");
      if (!nm || nm.startsWith("*MODEL_SPACE") || nm.startsWith("*PAPER_SPACE")) continue;
      blocks.set(nm, { base: (b.basePoint as P) ?? { x: 0, y: 0 }, entities: map((b.entities as Record<string, unknown>[]) ?? []) });
    }
    const model = (db.entities as unknown as Record<string, unknown>[]).filter((e) => !e.isInPaperSpace);
    const header = db.header as unknown as Record<string, unknown>;
    return { entities: map(model), blocks, insUnits: Number(header.INSUNITS ?? 0), metric: Number(header.MEASUREMENT ?? 1) === 1 };
  } finally {
    lib.dwg_free(ptr);
  }
}

function fromLibre(e: Record<string, unknown>): Ent[] {
  const layer = String(e.layer ?? "0");
  const p = (k: string) => (e[k] as P) ?? { x: 0, y: 0 };
  switch (e.type) {
    case "LINE":
      return [{ t: "line", layer, a: p("startPoint"), b: p("endPoint") }];
    case "LWPOLYLINE":
    case "POLYLINE2D":
      return [{ t: "poly", layer, v: (e.vertices as (P & { bulge?: number })[]) ?? [], closed: (Number(e.flag ?? 0) & 1) === 1 }];
    case "CIRCLE":
      return [{ t: "circle", layer, c: p("center"), r: Number(e.radius ?? 0) }];
    case "ARC":
      return [{ t: "arc", layer, c: p("center"), r: Number(e.radius ?? 0), a0: Number(e.startAngle ?? 0), a1: Number(e.endAngle ?? 0) }];
    case "ELLIPSE":
      return [{ t: "ellipse", layer, c: p("center"), major: p("majorAxisEndPoint"), ratio: Number(e.axisRatio ?? 1), a0: Number(e.startAngle ?? 0), a1: Number(e.endAngle ?? Math.PI * 2) }];
    case "SPLINE": {
      const pts = ((e.fitPoints as P[]) ?? []).length > 1 ? (e.fitPoints as P[]) : ((e.controlPoints as P[]) ?? []);
      return pts.length > 1 ? [{ t: "points", layer, v: pts }] : [];
    }
    case "TEXT":
    case "ATTRIB": {
      // An attribute's text can arrive as an object holding the string.
      const raw = e.text as unknown;
      const value = typeof raw === "string" ? raw : raw && typeof raw === "object" ? String((raw as Record<string, unknown>).text ?? (raw as Record<string, unknown>).value ?? "") : "";
      // Free-standing attributes come back with an empty position; the ones that matter are
      // read with their block below, at the block's own insertion point.
      const at = p("startPoint");
      if (!at.x && !at.y) return [];
      return [{ t: "text", layer, p: at, h: Number(e.textHeight ?? 1), value }];
    }
    case "MTEXT":
      return [{ t: "text", layer, p: p("insertionPoint"), h: Number(e.textHeight ?? 1), value: String(e.text ?? "") }];
    case "INSERT": {
      const at = p("insertionPoint");
      const out: Ent[] = [{ t: "insert", layer, name: String(e.name ?? ""), p: at, sx: Number(e.xScale ?? 1), sy: Number(e.yScale ?? 1), rot: Number(e.rotation ?? 0) }];
      // Tag balloons carry their code and description as attributes: read them where the block sits.
      for (const a of (e.attribs as Record<string, unknown>[] | undefined) ?? []) {
        const raw = a.text as unknown;
        const value = typeof raw === "string" ? raw : raw && typeof raw === "object" ? String((raw as Record<string, unknown>).text ?? "") : "";
        if (value.trim()) out.push({ t: "text", layer, p: at, h: Number(a.textHeight ?? 1), value });
      }
      return out;
    }
    default:
      return [];
  }
}

/* DXF: dxf-parser (angles in degrees for rotation, radians for arcs). */
async function readDxf(file: File): Promise<Cad> {
  const { default: DxfParser } = await import("dxf-parser");
  const text = await file.text();
  let dxf: Record<string, unknown> | null = null;
  try {
    dxf = new DxfParser().parseSync(text) as unknown as Record<string, unknown>;
  } catch {
    throw new Error("This DXF could not be read. Save it again as ASCII DXF and try once more.");
  }
  if (!dxf) throw new Error("This DXF is empty.");
  const deg = Math.PI / 180;
  const conv = (e: Record<string, unknown>): Ent[] => {
    const layer = String(e.layer ?? "0");
    const v = (e.vertices as (P & { bulge?: number })[]) ?? [];
    switch (e.type) {
      case "LINE":
        return v.length >= 2 ? [{ t: "line", layer, a: v[0], b: v[1] }] : [];
      case "LWPOLYLINE":
      case "POLYLINE":
        return [{ t: "poly", layer, v, closed: !!e.shape }];
      case "CIRCLE":
        return [{ t: "circle", layer, c: e.center as P, r: Number(e.radius ?? 0) }];
      case "ARC":
        return [{ t: "arc", layer, c: e.center as P, r: Number(e.radius ?? 0), a0: Number(e.startAngle ?? 0), a1: Number(e.endAngle ?? 0) }];
      case "ELLIPSE":
        return [{ t: "ellipse", layer, c: e.center as P, major: e.majorAxisEndPoint as P, ratio: Number(e.axisRatio ?? 1), a0: Number(e.startAngle ?? 0), a1: Number(e.endAngle ?? Math.PI * 2) }];
      case "SPLINE": {
        const pts = ((e.fitPoints as P[]) ?? []).length > 1 ? (e.fitPoints as P[]) : ((e.controlPoints as P[]) ?? []);
        return pts.length > 1 ? [{ t: "points", layer, v: pts }] : [];
      }
      case "TEXT":
        return [{ t: "text", layer, p: (e.startPoint as P) ?? { x: 0, y: 0 }, h: Number(e.textHeight ?? 1), value: String(e.text ?? "") }];
      case "MTEXT":
        return [{ t: "text", layer, p: (e.position as P) ?? { x: 0, y: 0 }, h: Number(e.height ?? 1), value: String(e.text ?? "") }];
      case "INSERT":
        return [{ t: "insert", layer, name: String(e.name ?? ""), p: (e.position as P) ?? { x: 0, y: 0 }, sx: Number(e.xScale ?? 1), sy: Number(e.yScale ?? 1), rot: Number(e.rotation ?? 0) * deg }];
      default:
        return [];
    }
  };
  const blocks = new Map<string, { base: P; entities: Ent[] }>();
  for (const [nm, b] of Object.entries((dxf.blocks as Record<string, Record<string, unknown>>) ?? {})) {
    if (nm.startsWith("*Model_Space") || nm.startsWith("*Paper_Space")) continue;
    blocks.set(nm, { base: (b.position as P) ?? { x: 0, y: 0 }, entities: ((b.entities as Record<string, unknown>[]) ?? []).flatMap(conv) });
  }
  const header = (dxf.header as Record<string, unknown>) ?? {};
  const ents = ((dxf.entities as Record<string, unknown>[]) ?? []).filter((e) => !e.inPaperSpace).flatMap(conv);
  return { entities: ents, blocks, insUnits: Number(header.$INSUNITS ?? 0), metric: Number(header.$MEASUREMENT ?? 1) === 1 };
}

/* ----------------------------------------------------------- PDF, image */

/** Words that make a page look like the kitchen sheet of a set. */
const KITCHEN_WORDS = /davlumbaz|hood|frit[öo]z|fryer|kuzine|range|[ıi]zgara|grill|griddle|wok|salamand|mutfak|kitchen|pi[sş]irme|cooking/gi;

async function readPdf(file: File, pageNo?: number): Promise<Drawing> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageText = async (n: number) => {
    const c = await (await doc.getPage(n)).getTextContent();
    return (c.items as Array<{ str?: string }>).map((i) => i.str ?? "").join(" ");
  };
  // A set of sheets: open the one that talks most about cooking, unless a page was asked for.
  let index = pageNo ?? 1;
  if (!pageNo && doc.numPages > 1) {
    let best = -1;
    for (let n = 1; n <= Math.min(doc.numPages, 40); n++) {
      const hits = ((await pageText(n)).match(KITCHEN_WORDS) ?? []).length;
      if (hits > best) {
        best = hits;
        index = n;
      }
    }
  }
  index = Math.min(Math.max(1, index), doc.numPages);
  const page = await doc.getPage(index);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, 2800 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the PDF.");
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const href = canvas.toDataURL("image/png");
  const H = canvas.height;

  const content = await page.getTextContent();
  const texts: DrawingText[] = [];
  for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
    if (!item.str || !item.transform) continue;
    const [px, py] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    texts.push({ x: px, y: H - py, h: Math.hypot(item.transform[2], item.transform[3]) * scale, value: item.str });
  }

  // Outlines drawn in the PDF, for the same detection a DWG gets.
  const list = await page.getOperatorList();
  const { shapes } = pdfVectors(pdfjs.OPS as unknown as PdfOps, list, viewport.transform, H);

  // One pixel is 1/72 in. of paper over the render scale; the printed drawing scale makes it real size.
  const printed = printedScale(texts.map((t) => t.value));
  const drawingScale = printed ?? 50;
  const unitGuess = shapes.length
    ? {
        inchesPerUnit: drawingScale / (72 * scale),
        label: printed ? `1:${printed}, read from the sheet` : "1:50, assumed",
        sure: false,
        note: printed
          ? `The sheet says 1:${printed}. Sizes are right only if the PDF was printed at that scale; check one known length.`
          : "No drawing scale was found on the sheet, so 1:50 is assumed. Check one known length.",
      }
    : null;

  return {
    source: "pdf",
    name: file.name,
    bounds: { minX: 0, minY: 0, maxX: canvas.width, maxY: H },
    layers: [],
    image: { href, width: canvas.width, height: H },
    texts,
    shapes,
    hints: findHints(texts),
    unitGuess,
    paperInchesPerUnit: 1 / (72 * scale),
    page: { index, count: doc.numPages },
    stats: { entities: content.items.length + shapes.length, skipped: doc.numPages - 1 },
  };
}

async function readImage(file: File): Promise<Drawing> {
  const href = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("The image could not be read."));
    fr.readAsDataURL(file);
  });
  const img = new Image();
  img.src = href;
  await img.decode();
  return {
    source: "image",
    name: file.name,
    bounds: { minX: 0, minY: 0, maxX: img.naturalWidth, maxY: img.naturalHeight },
    layers: [],
    image: { href, width: img.naturalWidth, height: img.naturalHeight },
    texts: [],
    shapes: [],
    hints: [],
    unitGuess: null,
    stats: { entities: 0, skipped: 0 },
  };
}
