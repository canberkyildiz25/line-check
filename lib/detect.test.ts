import { describe, expect, it } from "vitest";
import { autoDetect } from "./detect";
import type { Drawing, Shape } from "./drawing";

const MM = 1 / 25.4;
const draw = (shapes: Shape[], texts: Drawing["texts"]): Drawing => ({
  source: "dxf",
  name: "t",
  bounds: { minX: 0, minY: 0, maxX: 12000, maxY: 8000 },
  layers: [],
  texts,
  shapes,
  hints: [],
  unitGuess: null,
  stats: { entities: 0, skipped: 0 },
});

const rect = (x: number, y: number, w: number, h: number, layer = "EQUIP", block?: string): Shape => ({ x, y, w, h, layer, block });

describe("automatic detection", () => {
  const room = rect(0, 0, 12000, 8000, "WALL");
  const hood = rect(3000, 3000, 4800, 1300);
  const fry1 = rect(3200, 3150, 580, 900);
  const fry2 = rect(3800, 3150, 580, 900);
  const range = rect(4400, 3150, 880, 900);
  const sink = rect(9000, 3150, 1200, 700);

  it("matches tags on the plan to outlines through the schedule", () => {
    const d = draw(
      [room, hood, fry1, fry2, range, sink],
      [
        { x: 9000, y: 7000, h: 80, value: "E-01  Fritöz - set üstü  400V" },
        { x: 9000, y: 6900, h: 80, value: "G-01  Kuzine 6 gözlü" },
        { x: 9000, y: 6800, h: 80, value: "S-01  Evye" },
        { x: 3250, y: 3500, h: 60, value: "E-01" },
        { x: 3850, y: 3500, h: 60, value: "E-01" },
        { x: 4450, y: 3500, h: 60, value: "G-01" },
        { x: 9050, y: 3400, h: 60, value: "S-01" },
      ],
    );
    const r = autoDetect(d, MM);
    expect(r.hoods).toHaveLength(1);
    expect(r.hoods[0].items.map((i) => i.kind).sort()).toEqual(["fryer", "fryer", "range"]);
    expect(r.hoods[0].rect).toEqual({ x: 3000, y: 3000, w: 4800, h: 1300 });
    expect(r.hoods[0].drawn).toBe(false);
    expect(r.hoods[0].ducts).toHaveLength(1);
  });

  it("uses block names and wraps a hood around the line when none is drawn", () => {
    const d = draw([room, rect(3200, 3150, 600, 900, "EQ", "FRYER_600"), rect(3800, 3150, 900, 900, "EQ", "GRIDDLE-900")], []);
    const r = autoDetect(d, MM);
    expect(r.hoods).toHaveLength(1);
    expect(r.hoods[0].items.map((i) => i.kind)).toEqual(["fryer", "griddle"]);
    expect(r.hoods[0].drawn).toBe(true);
    expect(r.notes.join(" ")).toMatch(/No hood outline/);
  });

  it("splits two lines with their own hood outlines into two hoods", () => {
    const d = draw(
      [
        room,
        rect(1000, 1000, 2000, 1200),
        rect(1100, 1100, 600, 900, "EQ", "FRYER_600"),
        rect(1800, 1100, 900, 900, "EQ", "GRIDDLE-900"),
        rect(6000, 1000, 2500, 1200),
        rect(6100, 1100, 900, 900, "EQ", "RANGE_900"),
        rect(7100, 1100, 900, 900, "EQ", "WOK_900"),
      ],
      [],
    );
    const r = autoDetect(d, MM);
    expect(r.hoods).toHaveLength(2);
    expect(r.hoods.map((h) => h.items.map((i) => i.kind).sort())).toEqual([
      ["fryer", "griddle"],
      ["range", "wok"],
    ]);
    expect(r.hoods.every((h) => !h.drawn)).toBe(true);
  });

  it("draws one hood per separate line when no outline exists", () => {
    const d = draw([room, rect(1000, 1000, 600, 900, "EQ", "FRYER_600"), rect(1650, 1000, 900, 900, "EQ", "GRIDDLE-900"), rect(7000, 5000, 900, 900, "EQ", "RANGE_900")], []);
    const r = autoDetect(d, MM);
    expect(r.hoods).toHaveLength(2);
    expect(r.hoods[0].items).toHaveLength(2);
    expect(r.notes.join(" ")).toMatch(/2 were drawn/);
  });

  it("finds nothing in a drawing without equipment", () => {
    const r = autoDetect(draw([room], [{ x: 0, y: 0, h: 10, value: "PLAN" }]), MM);
    expect(r.hoods).toHaveLength(0);
  });
});
