import { defaultAppliance, type Appliance, type Design } from "./engine";
import type { ApplianceKind } from "./rules";

const a = (kind: ApplianceKind, id: string, extra: Partial<Appliance> = {}): Appliance => ({ ...defaultAppliance(kind, id), ...extra });

const common = {
  detection: { style: "scissors" as const, ambientF: 120 },
  gasValve: { type: "mechanical" as const, size: '1 1/2"' },
};

/** Three made-up lines to start from. None of them is a real kitchen. */
export const PRESETS: { id: string; label: string; design: Design }[] = [
  {
    id: "burger",
    label: "Burger line",
    design: {
      name: "Burger line",
      hood: { length: 144, depth: 54, clearance: 42, filterBank: "v-bank", plenumWidth: 24, lineOffset: 9 },
      ducts: [
        { id: "d1", position: 42, shape: "rect", sideA: 14, sideB: 14, diameter: 16 },
        { id: "d2", position: 104, shape: "rect", sideA: 14, sideB: 14, diameter: 16 },
      ],
      line: [
        a("fryer", "a1", { surfaceDepth: 18, surfaceLength: 24, potDepth: 18, potLength: 18, width: 21 }),
        a("fryer", "a2", { surfaceDepth: 18, surfaceLength: 24, potDepth: 18, potLength: 18, width: 21 }),
        a("griddle", "a3"),
        a("charbroiler-gas", "a4"),
      ],
      ...common,
    },
  },
  {
    id: "wok",
    label: "Wok station",
    design: {
      name: "Wok station",
      hood: { length: 120, depth: 54, clearance: 44, filterBank: "v-bank", plenumWidth: 24, lineOffset: 6 },
      ducts: [{ id: "d1", position: 60, shape: "rect", sideA: 16, sideB: 20, diameter: 18 }],
      line: [
        a("wok", "a1", { wokDiameter: 22, wokDepth: 5, tipHeight: 36 }),
        a("wok", "a2", { wokDiameter: 26, wokDepth: 7, tipHeight: 40 }),
        a("range", "a3", { surfaceLength: 24, surfaceDepth: 16, tipHeight: 34, width: 30 }),
        a("fryer", "a4", { dripboard: false, surfaceDepth: 14, surfaceLength: 14, potDepth: 14, potLength: 14, width: 18, tipHeight: 24 }),
      ],
      ...common,
    },
  },
  {
    id: "grill",
    label: "Grill house",
    design: {
      name: "Grill house",
      hood: { length: 168, depth: 60, clearance: 42, filterBank: "single", plenumWidth: 20, lineOffset: 12 },
      ducts: [
        { id: "d1", position: 46, shape: "rect", sideA: 18, sideB: 24, diameter: 20 },
        { id: "d2", position: 124, shape: "round", sideA: 12, sideB: 12, diameter: 16 },
      ],
      line: [
        a("charbroiler-charcoal", "a1", { fuelDepth: 3, tipHeight: 34 }),
        a("charbroiler-lava", "a2", { surfaceLength: 28, surfaceDepth: 24, tipHeight: 30 }),
        a("range", "a3", { surfaceLength: 24, surfaceDepth: 24, tipHeight: 36 }),
        a("salamander", "a4", { surfaceLength: 26, surfaceDepth: 14 }),
        a("fryer", "a5", { surfaceDepth: 18, surfaceLength: 24, potDepth: 18, potLength: 18, width: 21 }),
      ],
      ...common,
    },
  },
];

export const START = PRESETS[0].design;
