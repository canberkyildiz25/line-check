// Design limits for a pre-engineered wet chemical restaurant system, kept as
// data: published limits of a listed wet chemical system. All lengths are in
// inches, all areas in square inches, all temperatures in °F.

export const MANUAL_EDITION = "published design limits of a listed pre-engineered wet chemical system";

export type NozzleCode = "1/2N" | "1N" | "1F" | "1W" | "2W" | "230" | "245" | "260" | "290" | "2120" | "3N";

export const NOZZLES: Record<NozzleCode, { flow: number }> = {
  "1/2N": { flow: 0.5 },
  "1F": { flow: 1 },
  "1N": { flow: 1 },
  "1W": { flow: 1 },
  "2W": { flow: 2 },
  "3N": { flow: 3 },
  "230": { flow: 2 },
  "245": { flow: 2 },
  "260": { flow: 2 },
  "290": { flow: 2 },
  "2120": { flow: 2 },
};

/* ---------------------------------------------------------------- ducts */

export const DUCT = {
  /** One 1W covers a duct up to 50 in. perimeter or 16 in. diameter. */
  oneW: { perimeter: 50, diameter: 16 },
  /** One 2W covers up to 100 in. perimeter or 31 7/8 in. diameter. */
  twoW: { perimeter: 100, diameter: 31.875 },
  /** 1W + 2W (three flow) up to 135 in. perimeter, rectangular only, Figure 2. */
  threeFlow: { perimeter: 135 },
  /** Nozzle sits 2–8 in. into the duct opening, centred, discharging up. */
  tipIntoDuct: [2, 8] as const,
};

/** Figure 2: for a short side A, the longest side B may not exceed this. */
export const THREE_FLOW_MAX_B: Array<[sideA: number, maxB: number]> = [
  [4, 60], [5, 60], [6, 59.5], [7, 59], [8, 58.5], [9, 58], [10, 57], [11, 56],
  [12, 55.5], [13, 54.5], [14, 53.5], [15, 52], [16, 51], [17, 49.5], [18, 47.5],
  [19, 46], [20, 43.5], [21, 41], [22, 38], [23, 33.5],
];

/* --------------------------------------------------------------- plenum */

export type FilterBank = "single" | "v-bank";

export interface PlenumMethod {
  id: string;
  nozzle: NozzleCode;
  label: string;
  banks: FilterBank[];
  /** Linear feet of plenum one nozzle covers. */
  coversFt: number;
  /** Nozzles needed per covered length (two 1N on a V-bank). */
  perStretch: number;
  /** Plenum width limit in inches, if the method has one. */
  maxWidth?: number;
  placement: string;
}

export const PLENUM_METHODS: PlenumMethod[] = [
  {
    id: "1W-vertical",
    nozzle: "1W",
    label: "vertical",
    banks: ["single", "v-bank"],
    coversFt: 4,
    perStretch: 1,
    maxWidth: 48,
    placement: "On the filter centre line, 1–20 in. above the top edge, or 8–12 in. off the filter face aimed at its centre. First and last nozzle within 2 ft of the hood ends, 4 ft apart at most.",
  },
  {
    id: "1N-horizontal-single",
    nozzle: "1N",
    label: "horizontal, single bank",
    banks: ["single"],
    coversFt: 10,
    perStretch: 1,
    placement: "2–4 in. off the filter face, centred on the filter height, aimed down the length; tip 0–6 in. from the hood end.",
  },
  {
    id: "1W-horizontal-v",
    nozzle: "1W",
    label: "horizontal, V-bank",
    banks: ["v-bank"],
    coversFt: 6,
    perStretch: 1,
    maxWidth: 48,
    placement: "Mounted horizontally a third of the filter height down from the top; tip 0–6 in. from the hood end, then every 6 ft.",
  },
  {
    id: "1N-horizontal-v",
    nozzle: "1N",
    label: "horizontal, one per bank",
    banks: ["v-bank"],
    coversFt: 10,
    perStretch: 2,
    maxWidth: 48,
    placement: "One per bank, 2–4 in. off each filter face, aimed down the length; tip 0–6 in. from the hood end, every 10 ft.",
  },
];

/* ----------------------------------------------------------- appliances */

export type ApplianceKind =
  | "fryer"
  | "tilt-skillet"
  | "range"
  | "griddle"
  | "charbroiler-gas"
  | "charbroiler-lava"
  | "charbroiler-charcoal"
  | "charbroiler-wood"
  | "wok"
  | "salamander";

/** A single-nozzle fryer row: the fry pot alone, and the pot with its dripboard. Depth × length. */
export interface FryerSingleRow {
  nozzle: NozzleCode;
  pot: [depth: number, length: number];
  overall: [depth: number, length: number];
  height: [number, number];
  nonSplitOnly?: boolean;
  placement: string;
}

export const FRYER_SINGLE: FryerSingleRow[] = [
  { nozzle: "230", pot: [14, 15], overall: [14, 21], height: [27, 47], placement: "Tip anywhere along or inside the cooking-area perimeter, aimed at its centre." },
  { nozzle: "245", pot: [14, 15], overall: [14, 21], height: [20, 27], placement: "Tip anywhere along or inside the cooking-area perimeter, aimed at its centre." },
  { nozzle: "290", pot: [14, 15], overall: [14, 21], height: [13, 16], placement: "Tip over the midpoint of the hazard (±3 in. along the long side, ±1 in. along the short), aimed at the midpoint." },
  { nozzle: "290", pot: [14.5, 14], overall: [14.5, 26.5], height: [16, 27], placement: "Tip over the midpoint of the hazard (±3 in. along the long side, ±1 in. along the short), aimed at the midpoint." },
  { nozzle: "290", pot: [19.5, 19], overall: [19.5, 25.375], height: [13, 16], nonSplitOnly: true, placement: "Tip over the midpoint of the hazard (±3 in. along the long side, ±1 in. along the short), aimed at the midpoint." },
  { nozzle: "3N", pot: [19.5, 19], overall: [19.5, 25.375], height: [21, 34], nonSplitOnly: true, placement: "Tip in the front half of the fry pot, at most 34 in. diagonally from the hazard centre and at least 21 in. above it." },
  { nozzle: "3N", pot: [18, 18], overall: [18, 27.75], height: [25, 35], nonSplitOnly: true, placement: "Tip anywhere along or inside the cooking-area perimeter, aimed at its centre." },
];

/** A module of a multi-nozzle fryer: longest side and area, pot and pot-with-dripboard. */
export interface FryerModuleRow {
  nozzle: NozzleCode;
  pot: [maxSide: number, maxArea: number];
  overall: [maxSide: number, maxArea: number];
  height: [number, number];
}

export const FRYER_MODULE: FryerModuleRow[] = [
  { nozzle: "230", pot: [21, 210], overall: [21, 294], height: [27, 47] },
  { nozzle: "245", pot: [21, 210], overall: [21, 294], height: [20, 27] },
  { nozzle: "290", pot: [21, 210], overall: [21, 294], height: [13, 16] },
  { nozzle: "290", pot: [25.375, 370.5], overall: [25.375, 495], height: [13, 16] },
  { nozzle: "290", pot: [26.5, 203], overall: [26.5, 384.25], height: [16, 27] },
  { nozzle: "3N", pot: [25.375, 370.5], overall: [25.375, 495], height: [21, 34] },
  { nozzle: "3N", pot: [27.75, 324], overall: [27.75, 497], height: [25, 35] },
];

/** The largest fryer that may be split into modules: 864 sq. in. */
export const FRYER_MAX_MODULAR_AREA = 864;

/** Surface-type appliances: a nozzle covers a longest side and an area. */
export interface SurfaceRow {
  nozzle: NozzleCode;
  qty: number;
  maxSide: number;
  maxArea: number;
  height: [number, number];
  /** Maximum depth of charcoal or wood, where it applies. */
  maxFuelDepth?: number;
  placement: string;
}

export const RANGE: SurfaceRow[] = [
  { nozzle: "1N", qty: 1, maxSide: 32, maxArea: 384, height: [30, 40], placement: "Within 10 in. of each burner-grate centre line, aimed at the centre of the cooking surface." },
  { nozzle: "1F", qty: 1, maxSide: 28, maxArea: 336, height: [40, 48], placement: "Over the front edge of the grates, tip flats parallel to the front-to-rear centre line, aimed at the centre. Works with a back shelf." },
  { nozzle: "260", qty: 1, maxSide: 32, maxArea: 768, height: [30, 40], placement: "Pointed straight down at the centre of the cooking surface, or within 10 in. of every grate centre." },
  { nozzle: "245", qty: 1, maxSide: 28, maxArea: 672, height: [40, 50], placement: "Pointed straight down at the centre, or within 11 3/8 in. of every grate centre." },
  { nozzle: "290", qty: 2, maxSide: 36, maxArea: 1008, height: [15, 20], placement: "One at each end, 0–1.5 in. inside the perimeter, aimed 45° along the long centre line." },
];

export const GRIDDLE: SurfaceRow[] = [
  { nozzle: "1N", qty: 1, maxSide: 36, maxArea: 1080, height: [35, 40], placement: "Along any edge, 0–2 in. inside the perimeter, aimed at the midpoint." },
  { nozzle: "290", qty: 1, maxSide: 30, maxArea: 720, height: [30, 50], placement: "Within 1 in. of the centre of the surface, pointed straight down." },
  { nozzle: "260", qty: 1, maxSide: 48, maxArea: 1440, height: [30, 50], placement: "Along any edge, 0–2 in. inside the perimeter, aimed at the centre." },
  { nozzle: "290", qty: 1, maxSide: 48, maxArea: 1440, height: [20, 30], placement: "Along any edge, 0–2 in. inside the perimeter, aimed at the centre." },
  { nozzle: "2120", qty: 1, maxSide: 48, maxArea: 1440, height: [10, 20], placement: "Along any edge, 0–2 in. inside the perimeter, aimed at the centre." },
];

export const CHARBROILER_GAS: SurfaceRow[] = [
  { nozzle: "1N", qty: 1, maxSide: 36, maxArea: 864, height: [15, 40], placement: "Anywhere along or inside the cooking-area perimeter, aimed at the centre." },
];

export const CHARBROILER_LAVA: SurfaceRow[] = [
  { nozzle: "1N", qty: 1, maxSide: 24, maxArea: 312, height: [18, 35], placement: "Anywhere along or inside the cooking-area perimeter, angled to the centre." },
  { nozzle: "3N", qty: 1, maxSide: 30, maxArea: 720, height: [14, 40], placement: "Anywhere along or inside the cooking-area perimeter, angled to the centre." },
];

export const CHARBROILER_CHARCOAL: SurfaceRow[] = [
  { nozzle: "1N", qty: 1, maxSide: 24, maxArea: 288, height: [18, 40], maxFuelDepth: 4, placement: "Anywhere along or inside the cooking-area perimeter, aimed at the centre." },
  { nozzle: "3N", qty: 1, maxSide: 30, maxArea: 720, height: [14, 40], maxFuelDepth: 4, placement: "Anywhere along or inside the cooking-area perimeter, angled to the centre." },
];

export const CHARBROILER_WOOD: SurfaceRow[] = [
  { nozzle: "3N", qty: 1, maxSide: 30, maxArea: 720, height: [14, 40], maxFuelDepth: 6, placement: "Anywhere along or inside the cooking-area perimeter, aimed at the centre. Logs no thicker than 4 in." },
];

/** Woks are judged by pan diameter and depth. */
export const WOK: Array<{
  nozzle: NozzleCode;
  diameter: [number, number];
  depth: [number, number];
  height: [number, number];
  placement: string;
}> = [
  { nozzle: "1N", diameter: [11, 24], depth: [3, 6], height: [30, 40], placement: "Anywhere along or inside the wok perimeter, aimed at the centre." },
  { nozzle: "260", diameter: [14, 30], depth: [3.75, 8], height: [35, 45], placement: "Within 1 in. of the wok centre, pointed straight down." },
];

/** Upright and salamander broilers: protected through the chamber, not by height. */
export const SALAMANDER: Array<{
  nozzle: NozzleCode;
  qty: number;
  chamber: [number, number];
  placement: string;
}> = [
  { nozzle: "1N", qty: 1, chamber: [16, 29], placement: "In line with either vertical edge of the opening, 6–12 in. in front and 0–12 in. above the broiler, aimed at the opening's centre." },
  { nozzle: "1/2N", qty: 2, chamber: [30, 32.5], placement: "Always a pair: one above the grate aimed at the back opposite corner, one down through the slot into the drip pan." },
];

/* ------------------------------------------------------ tanks, cartridge */

export interface SystemRow {
  min: number;
  max: number;
  /** Every agent tank, in gallons; each one feeds its own distribution network. */
  tankSizes: number[];
  tanks: number;
  gallons: number;
  kind: "single" | "double" | "multiple";
  /** "(2) " in front of an entry means two of it. */
  hardware: string[];
  cartridges: string[];
}

const row = (min: number, max: number, tankSizes: number[], kind: SystemRow["kind"], hardware: string[], cartridges: string[]): SystemRow => ({
  min,
  max,
  tankSizes,
  tanks: tankSizes.length,
  gallons: tankSizes.reduce((s, g) => s + g, 0),
  kind,
  hardware,
  cartridges,
});

/** System Selection Guide (nitrogen column, first option for each band). */
export const SYSTEMS: SystemRow[] = [
  row(0.5, 5, [1.5], "single", ["1.5 gal regulated release"], ["for a 1.5 gal release"]),
  row(5.5, 11, [3], "single", ["3.0 gal regulated release"], ["for a 3.0 gal release"]),
  row(11.5, 16, [1.5, 3], "double", ["1.5 gal regulated release", "3.0 gal additional tank"], ["for a double-tank release"]),
  row(16.5, 22, [3, 3], "double", ["3.0 gal regulated release", "3.0 gal additional tank"], ["for a double-tank release"]),
  row(22.5, 33, [3, 3, 3], "multiple", ["3.0 gal regulated release", "3.0 gal regulated actuator", "3.0 gal additional tank"], ["for a 3.0 gal release", "for a regulated actuator"]),
  row(33.5, 38, [1.5, 3, 3, 3], "multiple", ["1.5 gal regulated release", "3.0 gal regulated actuator", "Double 3.0 gal tank box"], ["for a 1.5 gal release", "for a regulated actuator"]),
  row(38.5, 44, [3, 3, 3, 3], "multiple", ["3.0 gal regulated release", "3.0 gal regulated actuator", "Double 3.0 gal tank box"], ["for a 3.0 gal release", "for a regulated actuator"]),
  row(44.5, 49, [1.5, 3, 3, 3, 3], "multiple", ["1.5 gal regulated release", "3.0 gal additional tank", "3.0 gal regulated actuator", "Double 3.0 gal tank box"], ["for a double-tank release", "for a regulated actuator"]),
  row(49.5, 55, [3, 3, 3, 3, 3], "multiple", ["3.0 gal regulated release", "3.0 gal additional tank", "3.0 gal regulated actuator", "Double 3.0 gal tank box"], ["for a double-tank release", "for a regulated actuator"]),
  row(55.5, 60, [1.5, 3, 3, 3, 3, 3], "multiple", ["1.5 gal regulated release", "(3) 3.0 gal additional tank", "(2) 3.0 gal regulated actuator"], ["for a double-tank release", "(2) for a regulated actuator"]),
  row(60.5, 66, [3, 3, 3, 3, 3, 3], "multiple", ["3.0 gal regulated release", "(3) 3.0 gal additional tank", "(2) 3.0 gal regulated actuator"], ["for a double-tank release", "(2) for a regulated actuator"]),
  row(66.5, 71, [1.5, 3, 3, 3, 3, 3, 3], "multiple", ["1.5 gal regulated release", "(2) 3.0 gal regulated actuator", "(2) Double 3.0 gal tank box"], ["for a 1.5 gal release", "(2) for a regulated actuator"]),
  row(71.5, 77, [3, 3, 3, 3, 3, 3, 3], "multiple", ["3.0 gal regulated release", "(2) 3.0 gal regulated actuator", "(2) Double 3.0 gal tank box"], ["for a 3.0 gal release", "(2) for a regulated actuator"]),
  row(77.5, 82, [1.5, 3, 3, 3, 3, 3, 3, 3], "multiple", ["1.5 gal regulated release", "3.0 gal additional tank", "(2) 3.0 gal regulated actuator", "(2) Double 3.0 gal tank box"], ["for the regulated release", "(2) for a regulated actuator"]),
  row(82.5, 88, [3, 3, 3, 3, 3, 3, 3, 3], "multiple", ["3.0 gal regulated release", "3.0 gal additional tank", "(2) 3.0 gal regulated actuator", "(2) Double 3.0 gal tank box"], ["for the regulated release", "(2) for a regulated actuator"]),
  row(88.5, 99, [3, 3, 3, 3, 3, 3, 3, 3, 3], "multiple", ["Remote mechanical release", "(3) 3.0 gal regulated actuator", "(3) Double 3.0 gal tank box"], ["CO2 cartridge for the remote mechanical release", "(3) for a regulated actuator"]),
  row(99.5, 110, [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], "multiple", ["Remote mechanical release", "(4) 3.0 gal regulated actuator", "(3) Double 3.0 gal tank box"], ["CO2 cartridge for the remote mechanical release", "(3) for a regulated actuator", "for a single-tank regulated actuator"]),
];

/* -------------------------------------------------- distribution piping */

export interface BranchLimit {
  length: number;
  rise: number;
  elbows: number;
  tees: number;
  flow: number;
}

export interface PipingLimit {
  /** Basic flow numbers one tank of this size feeds. */
  flow: number;
  /** Start of the first branch line to start of the last, both legs of a split supply together. */
  firstToLast: number;
  /** All branch lines added up. */
  branchTotal: number;
  supply: BranchLimit;
  duct: BranchLimit & { nozzles?: number };
  plenum: BranchLimit;
  appliance: BranchLimit;
}

/** Distribution piping per tank, in inches. Each tank has its own network unless two 3.0 gal tanks are manifolded. */
export const PIPING: Record<"1.5" | "3", PipingLimit> = {
  "1.5": {
    flow: 5,
    firstToLast: 96,
    branchTotal: 264,
    supply: { length: 480, rise: 72, elbows: 9, tees: 1, flow: 5 },
    duct: { length: 72, rise: 48, elbows: 4, tees: 1, flow: 2 },
    plenum: { length: 48, rise: 24, elbows: 4, tees: 2, flow: 2 },
    appliance: { length: 120, rise: 24, elbows: 6, tees: 3, flow: 3 },
  },
  "3": {
    flow: 11,
    firstToLast: 288,
    branchTotal: 432,
    supply: { length: 480, rise: 72, elbows: 9, tees: 1, flow: 11 },
    duct: { length: 96, rise: 48, elbows: 4, tees: 2, flow: 4, nozzles: 2 },
    plenum: { length: 48, rise: 24, elbows: 4, tees: 2, flow: 2 },
    appliance: { length: 144, rise: 24, elbows: 6, tees: 4, flow: 4 },
  },
};

/* ------------------------------------------------------------ detection */

/** Per system: detectors, pulley elbows, feet of 1/2 in. conduit. */
export const DETECTOR_STYLES = {
  "clip-on": { label: "Clip-on", maxDetectors: 12, maxElbows: 18, maxConduitFt: 125 },
  scissors: { label: "Scissors", maxDetectors: 15, maxElbows: 20, maxConduitFt: 150 },
  hinge: { label: "Hinge", maxDetectors: 5, maxElbows: 8, maxConduitFt: 103 },
} as const;
export type DetectorStyle = keyof typeof DETECTOR_STYLES;

/** One detector covers a continuous cooking surface up to 48 × 48 in. */
export const DETECTOR_SURFACE = 48;
/** A duct detector also covers the appliance below if it sits ≤ 12 in. into the duct. */
export const DUCT_DETECTOR_COVERS_WITHIN = 12;

/** K-style links by highest temperature at the detector; ML style for 500 °F. */
export const FUSIBLE_LINKS: Array<{ ratingF: number; ratingC: number; maxAmbientF: number; style: "K" | "ML" }> = [
  { ratingF: 165, ratingC: 74, maxAmbientF: 100, style: "K" },
  { ratingF: 212, ratingC: 100, maxAmbientF: 150, style: "K" },
  { ratingF: 280, ratingC: 138, maxAmbientF: 225, style: "K" },
  { ratingF: 360, ratingC: 182, maxAmbientF: 290, style: "K" },
  { ratingF: 450, ratingC: 232, maxAmbientF: 360, style: "K" },
  { ratingF: 500, ratingC: 260, maxAmbientF: 400, style: "ML" },
];

/* --------------------------------------------- gas valves, pull station */

export const GAS_VALVES = {
  mechanical: [{ size: '3/4"' }, { size: '1"' }, { size: '1 1/4"' }, { size: '1 1/2"' }, { size: '2"' }, { size: '2 1/2"' }, { size: '3"' }],
  electrical: [{ size: '3/4"' }, { size: '1"' }, { size: '1 1/2"' }, { size: '2"' }, { size: '3"' }],
} as const;
export type GasValveType = keyof typeof GAS_VALVES;

export const PULL_STATION = { heightIn: [42, 48] as const, maxCableFt: 150, maxElbows: 20 };

/** Piping rules worth stating on the sheet. */
export const PIPING_NOTES = [
  "Distribution piping is 3/8 in. Schedule 40 black iron, chrome-plated or stainless steel. Never hot-dipped galvanized.",
  "At least 6 ft of 3/8 in. pipe between the tank outlet and any nozzle protecting a range, fryer or wok.",
  "Pipe lengths are measured centre to centre of fittings; two 45° elbows count as one 90°.",
  "Each branch line includes the tee or elbow that starts it; a branch line cannot start ahead of a supply line tee.",
  "Each tank feeds its own network. The sheet's lengths are estimates from the hood geometry; measure the real runs and fittings against the limits above.",
];
