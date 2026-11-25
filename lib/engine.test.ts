import { describe, expect, it } from "vitest";
import { defaultAppliance, solve, type Appliance, type Design } from "./engine";

const base = (line: Appliance[], over: Partial<Design> = {}): Design => ({
  name: "Test",
  hood: { length: 120, depth: 48, clearance: 42, filterBank: "v-bank", plenumWidth: 24, lineOffset: 6 },
  ducts: [{ id: "d1", position: 60, shape: "rect", sideA: 12, sideB: 12, diameter: 0 }],
  line,
  detection: { style: "scissors", ambientF: 120 },
  gasValve: { type: "mechanical", size: '1"' },
  ...over,
});

const app = (kind: Appliance["kind"], extra: Partial<Appliance> = {}): Appliance => ({ ...defaultAppliance(kind, kind), ...extra });

describe("ducts", () => {
  it("uses a 1W up to 50 in. perimeter and a 2W up to 100 in.", () => {
    const r1 = solve(base([], { ducts: [{ id: "d", position: 60, shape: "rect", sideA: 12, sideB: 13, diameter: 0 }] }));
    expect(r1.protections[0].summary).toContain("1W");
    expect(r1.flow.duct).toBe(1);
    const r2 = solve(base([], { ducts: [{ id: "d", position: 60, shape: "rect", sideA: 20, sideB: 24, diameter: 0 }] }));
    expect(r2.flow.duct).toBe(2);
  });

  it("allows 1W + 2W to 135 in. only inside Figure 2", () => {
    const ok = solve(base([], { ducts: [{ id: "d", position: 60, shape: "rect", sideA: 8, sideB: 55, diameter: 0 }] }));
    expect(ok.flow.duct).toBe(3);
    const tooLong = solve(base([], { ducts: [{ id: "d", position: 60, shape: "rect", sideA: 22, sideB: 44, diameter: 0 }] }));
    expect(tooLong.protections[0].ok).toBe(false);
  });

  it("covers round ducts to 16 in. with 1W and to 31 7/8 in. with 2W", () => {
    expect(solve(base([], { ducts: [{ id: "d", position: 60, shape: "round", sideA: 0, sideB: 0, diameter: 16 }] })).flow.duct).toBe(1);
    expect(solve(base([], { ducts: [{ id: "d", position: 60, shape: "round", sideA: 0, sideB: 0, diameter: 30 }] })).flow.duct).toBe(2);
    expect(solve(base([], { ducts: [{ id: "d", position: 60, shape: "round", sideA: 0, sideB: 0, diameter: 34 }] })).protections[0].ok).toBe(false);
  });
});

describe("plenum", () => {
  it("picks the cheapest V-bank method: 10 ft hood → two 1N or two 1W horizontal", () => {
    const r = solve(base([]));
    expect(r.flow.plenum).toBe(2);
  });
  it("single bank 10 ft → one 1N", () => {
    const r = solve(base([], { hood: { length: 120, depth: 48, clearance: 42, filterBank: "single", plenumWidth: 24, lineOffset: 6 } }));
    expect(r.flow.plenum).toBe(1);
    expect(r.protections.find((p) => p.zone === "plenum")!.summary).toContain("1N");
  });
});

describe("appliances", () => {
  it("fryer with dripboard, 18 × 18 pot, 18 × 24 overall: 3N at 25–35 in.", () => {
    const f = app("fryer", { surfaceDepth: 18, surfaceLength: 24, potDepth: 18, potLength: 18, tipHeight: 30, dripboard: true });
    const r = solve(base([f]));
    const p = r.protections.find((x) => x.ref === "fryer")!;
    expect(p.ok).toBe(true);
    expect(p.summary).toContain("3N");
    expect(p.flow).toBe(3);
  });

  it("same fryer at 14 in. tip height takes the 290 instead", () => {
    const f = app("fryer", { surfaceDepth: 18, surfaceLength: 24, potDepth: 18, potLength: 18, tipHeight: 14, dripboard: true });
    expect(solve(base([f])).protections.find((x) => x.ref === "fryer")!.summary).toContain("290");
  });

  it("splits an 18 × 30 pot / 24 × 30 overall fryer into two modules", () => {
    const f = app("fryer", { surfaceDepth: 24, surfaceLength: 30, potDepth: 18, potLength: 30, tipHeight: 30, dripboard: true });
    const p = solve(base([f])).protections.find((x) => x.ref === "fryer")!;
    expect(p.ok).toBe(true);
    expect(p.summary).toMatch(/^2 × (3N|290)/);
  });

  it("refuses a fryer over 864 sq. in.", () => {
    const f = app("fryer", { surfaceDepth: 30, surfaceLength: 30, potDepth: 30, potLength: 30, dripboard: true });
    expect(solve(base([f])).protections.find((x) => x.ref === "fryer")!.ok).toBe(false);
  });

  it("range 24 × 24 at 35 in.: one 260 is cheaper than nothing and the 1N fits too", () => {
    const p = solve(base([app("range", { surfaceLength: 24, surfaceDepth: 16, tipHeight: 35 })])).protections.find((x) => x.ref === "range")!;
    expect(p.summary).toContain("1N");
    expect(p.flow).toBe(1);
  });

  it("range at 17 in. needs the pair of 290s", () => {
    const p = solve(base([app("range", { surfaceLength: 30, surfaceDepth: 30, tipHeight: 17 })])).protections.find((x) => x.ref === "range")!;
    expect(p.summary).toContain("2 × 290");
    expect(p.flow).toBe(4);
  });

  it("griddle 36 × 24 at 25 in.: 290 perimeter", () => {
    const p = solve(base([app("griddle", { tipHeight: 25 })])).protections.find((x) => x.ref === "griddle")!;
    expect(p.summary).toContain("290");
  });

  it("charcoal deeper than 4 in. is not covered", () => {
    const p = solve(base([app("charbroiler-charcoal", { fuelDepth: 5 })])).protections.find((x) => x.ref === "charbroiler-charcoal")!;
    expect(p.ok).toBe(false);
  });

  it("wok 28 in. across needs the 260 at 35–45 in.", () => {
    const low = solve(base([app("wok", { wokDiameter: 28, wokDepth: 6, tipHeight: 32 })])).protections.find((x) => x.ref === "wok")!;
    expect(low.ok).toBe(false);
    expect(low.alternatives?.[0].label).toContain("260");
    const ok = solve(base([app("wok", { wokDiameter: 28, wokDepth: 6, tipHeight: 40 })])).protections.find((x) => x.ref === "wok")!;
    expect(ok.summary).toContain("260");
  });

  it("salamander uses the 1N when the chamber is small enough, else a pair of 1/2N", () => {
    const small = solve(base([app("salamander", { surfaceLength: 26, surfaceDepth: 14 })])).protections.find((x) => x.ref === "salamander")!;
    expect(small.summary).toContain("1N");
    const big = solve(base([app("salamander", { surfaceLength: 30, surfaceDepth: 20 })])).protections.find((x) => x.ref === "salamander")!;
    expect(big.summary).toContain("2 × 1/2N");
    expect(big.flow).toBe(1);
  });
});

describe("tank selection", () => {
  it("maps flow numbers onto the selection guide", () => {
    const line = [
      app("fryer", { id: "f1", surfaceDepth: 18, surfaceLength: 24, potDepth: 18, potLength: 18 }),
      app("fryer", { id: "f2", surfaceDepth: 18, surfaceLength: 24, potDepth: 18, potLength: 18 }),
    ];
    const r = solve(base(line)); // 1 duct + 2 plenum + 3 + 3 = 9
    expect(r.flow.total).toBe(9);
    expect(r.system?.gallons).toBe(3);
    const r2 = solve(base([...line, app("fryer", { id: "f3", surfaceDepth: 18, surfaceLength: 24, potDepth: 18, potLength: 18 })], { hood: { length: 144, depth: 48, clearance: 42, filterBank: "v-bank", plenumWidth: 24, lineOffset: 6 } }));
    expect(r2.flow.total).toBe(12);
    expect(r2.system?.tanks).toBe(2);
  });
});

describe("detection", () => {
  it("one detector per duct; appliances under a duct share it", () => {
    const r = solve(base([app("griddle", { id: "g" }), app("range", { id: "r" })], { ducts: [{ id: "d1", position: 20, shape: "rect", sideA: 12, sideB: 12, diameter: 0 }] }));
    // griddle spans 6–42 (under duct at 20), range 42–78 needs its own
    expect(r.detectors.length).toBe(2);
  });
  it("chooses the fusible link from the ambient temperature", () => {
    expect(solve(base([], { detection: { style: "scissors", ambientF: 140 } })).link?.ratingF).toBe(212);
    expect(solve(base([], { detection: { style: "scissors", ambientF: 300 } })).link?.ratingF).toBe(450);
  });
});

describe("geometry", () => {
  it("stops when the line runs past the hood", () => {
    const r = solve(base([app("range"), app("range", { id: "r2" }), app("range", { id: "r3" }), app("range", { id: "r4" })]));
    expect(r.findings.some((f) => f.level === "stop" && f.text.includes("past the end of the hood"))).toBe(true);
  });
});

describe("plan positions", () => {
  it("honours an explicit start and flags overlaps", () => {
    const r = solve(base([app("griddle", { id: "g", x: 10 }), app("range", { id: "r", x: 30 })]));
    expect(r.applianceX.r.start).toBe(30);
    expect(r.findings.some((f) => f.level === "stop" && f.text.includes("overlap"))).toBe(true);
  });
  it("checks cable runs measured on the plan", () => {
    const r = solve(base([app("griddle")], { site: { pullCable: 200 * 12, gasCable: 40 * 12, pipeToFirstNozzle: 50 } }));
    expect(r.findings.some((f) => f.text.includes("pull station cable"))).toBe(true);
    expect(r.findings.some((f) => f.text.includes("gas valve cable"))).toBe(false);
  });
});
