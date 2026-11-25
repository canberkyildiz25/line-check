import { describe, expect, it } from "vitest";
import { boxesFromLines, type Seg } from "./boxes";

const box = (x: number, y: number, w: number, h: number): Seg[] => [
  { x0: x, y0: y, x1: x + w, y1: y, layer: "K" },
  { x0: x + w, y0: y, x1: x + w, y1: y + h, layer: "K" },
  { x0: x + w, y0: y + h, x1: x, y1: y + h, layer: "K" },
  { x0: x, y0: y + h, x1: x, y1: y, layer: "K" },
];

describe("boxes from loose CAD lines", () => {
  it("closes a box drawn as four lines", () => {
    const out = boxesFromLines(box(100, 200, 800, 700), 0.01, 10);
    expect(out).toEqual([{ x: 100, y: 200, w: 800, h: 700, layer: "K" }]);
  });

  it("finds two boxes side by side that share an edge", () => {
    const out = boxesFromLines([...box(0, 0, 400, 700), ...box(400, 0, 800, 700)], 0.01, 10);
    expect(out.map((b) => b.w).sort((a, b) => a - b)).toEqual([400, 800]);
  });

  it("ignores three sides with no fourth", () => {
    expect(boxesFromLines(box(0, 0, 500, 500).slice(0, 3), 0.01, 10)).toEqual([]);
  });
});
