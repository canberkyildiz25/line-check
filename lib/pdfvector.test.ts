import { describe, expect, it } from "vitest";
import { pdfVectors, printedScale, type PdfOps } from "./pdfvector";

const OPS: PdfOps = { save: 1, restore: 2, transform: 3, constructPath: 4, paintFormXObjectBegin: 5, paintFormXObjectEnd: 6 };
const STROKE = 20;
const identity = [1, 0, 0, 1, 0, 0];

/** One constructPath per entry; each entry is a list of subpaths given as points. */
function list(paths: { pts: [number, number][]; close?: boolean }[][]) {
  const fnArray: number[] = [];
  const argsArray: unknown[] = [];
  for (const subpaths of paths) {
    const data: number[] = [];
    for (const sp of subpaths) {
      sp.pts.forEach(([x, y], i) => data.push(i === 0 ? 0 : 1, x, y));
      if (sp.close) data.push(4);
    }
    fnArray.push(OPS.constructPath);
    argsArray.push([STROKE, [Float32Array.from(data)], null]);
  }
  return { fnArray, argsArray };
}

describe("PDF vectors", () => {
  it("reads a closed rectangle as an outline", () => {
    const l = list([[{ pts: [[10, 10], [110, 10], [110, 60], [10, 60]], close: true }]]);
    const { shapes } = pdfVectors(OPS, l, identity, 1000);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ w: 100, h: 50 });
  });

  it("closes a box drawn as four loose lines", () => {
    const l = list([
      [{ pts: [[0, 0], [80, 0]] }],
      [{ pts: [[80, 0], [80, 60]] }],
      [{ pts: [[80, 60], [0, 60]] }],
      [{ pts: [[0, 60], [0, 0]] }],
    ]);
    const { shapes } = pdfVectors(OPS, l, identity, 1000);
    expect(shapes.some((s) => Math.round(s.w) === 80 && Math.round(s.h) === 60)).toBe(true);
  });

  it("closes a dashed box", () => {
    const dashes: { pts: [number, number][] }[] = [];
    const dash = (x0: number, y0: number, x1: number, y1: number) => dashes.push({ pts: [[x0, y0], [x1, y1]] });
    for (let x = 0; x < 200; x += 10) {
      dash(x, 0, Math.min(x + 6, 200), 0);
      dash(x, 100, Math.min(x + 6, 200), 100);
    }
    for (let y = 2; y < 100; y += 10) {
      dash(0, y, 0, Math.min(y + 6, 100));
      dash(200, y, 200, Math.min(y + 6, 100));
    }
    const { shapes } = pdfVectors(OPS, list([dashes]), identity, 1000);
    expect(shapes.some((s) => s.w > 190 && s.h > 90)).toBe(true);
  });

  it("finds the drawing scale printed on the sheet", () => {
    expect(printedScale(["MUTFAK PLANI   ÖLÇEK 1/50", "DETAY 1:20"])).toBe(50);
    expect(printedScale(["SCALE 1:100"])).toBe(100);
    expect(printedScale(["Rev 1/3", "12/05/2026"])).toBe(null);
  });
});
