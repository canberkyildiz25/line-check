import { describe, expect, it } from "vitest";
import { planPiping, type PipeNozzle } from "./piping";
import { SYSTEMS } from "./rules";

const bySize = (flow: number) => SYSTEMS.find((s) => flow >= s.min && flow <= s.max)!;
const appliance = (n: number, flow: number, step = 24): PipeNozzle[] =>
  Array.from({ length: n }, (_, i) => ({ zone: "appliance" as const, ref: `a${i}`, flow, x: 12 + i * step, tip: 30 }));
const hood = { length: 240, clearance: 24 };

describe("distribution piping", () => {
  it("keeps every tank inside its basic flow", () => {
    const nozzles: PipeNozzle[] = [
      { zone: "duct", ref: "d1", flow: 2, x: 60 },
      { zone: "plenum", ref: "plenum", flow: 1, x: 40 },
      { zone: "plenum", ref: "plenum", flow: 1, x: 160 },
      ...appliance(6, 2),
    ];
    const p = planPiping({ nozzles, hood }, bySize(16))!;
    expect(p.steppedUp).toBe(false);
    p.tanks.forEach((t) => expect(t.flow).toBeLessThanOrEqual(t.capacity));
    expect(p.tanks.reduce((s, t) => s + t.flow, 0)).toBe(16);
  });

  it("takes the next size when two-flow nozzles cannot fill 5 + 11", () => {
    // 16 flow numbers as eight 2-flow nozzles: a 1.5 gal tank takes 4, a 3.0 gal 10.
    const p = planPiping({ nozzles: appliance(8, 2), hood }, bySize(16))!;
    expect(p.steppedUp).toBe(true);
    expect(p.system.tankSizes).toEqual([3, 3]);
  });

  it("puts at most 4 flow numbers on one appliance branch of a 3.0 gal tank", () => {
    const p = planPiping({ nozzles: appliance(4, 2, 12), hood }, bySize(8))!;
    const branches = p.tanks[0].branches.filter((b) => b.kind === "appliance");
    expect(branches.length).toBe(2);
    branches.forEach((b) => expect(b.flow).toBeLessThanOrEqual(4));
  });

  it("flags a supply line past 40 ft", () => {
    const p = planPiping({ nozzles: appliance(2, 2), hood, tankToHood: 500 }, bySize(4))!;
    expect(p.tanks[0].problems.some((t) => t.includes("supply line"))).toBe(true);
  });

  it("sizes systems past 55 flow numbers from the appendix", () => {
    expect(bySize(70).tankSizes.length).toBe(7);
    expect(bySize(110).gallons).toBe(30);
  });
});
