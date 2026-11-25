import {
  CHARBROILER_CHARCOAL,
  CHARBROILER_GAS,
  CHARBROILER_LAVA,
  CHARBROILER_WOOD,
  DETECTOR_STYLES,
  DETECTOR_SURFACE,
  DUCT,
  FRYER_MAX_MODULAR_AREA,
  FRYER_MODULE,
  FRYER_SINGLE,
  FUSIBLE_LINKS,
  GAS_VALVES,
  GRIDDLE,
  NOZZLES,
  PLENUM_METHODS,
  PULL_STATION,
  RANGE,
  SALAMANDER,
  SYSTEMS,
  THREE_FLOW_MAX_B,
  WOK,
  type ApplianceKind,
  type DetectorStyle,
  type FilterBank,
  type GasValveType,
  type NozzleCode,
  type SurfaceRow,
  type SystemRow,
} from "./rules";
import { planPiping, type Piping } from "./piping";

/* ------------------------------------------------------------------ input */

export interface Appliance {
  id: string;
  kind: ApplianceKind;
  /** Start of the appliance along the hood, from its left end. Absent: right after the previous one. */
  x?: number;
  /** Back-to-back lines under one island hood: 0 for the first row, 1 for the next, and so on. */
  row?: number;
  /** Overall width of the appliance along the line. */
  width: number;
  /** Cooking surface, side to side. For a fryer: overall vat including dripboard. */
  surfaceLength: number;
  /** Cooking surface, front to back. */
  surfaceDepth: number;
  /** Nozzle tip height above the cooking surface. */
  tipHeight: number;
  /** Fryers: does the vat include a dripboard area? */
  dripboard?: boolean;
  /** Fryers: fry pot alone, front to back and side to side. */
  potDepth?: number;
  potLength?: number;
  splitVat?: boolean;
  /** Woks. */
  wokDiameter?: number;
  wokDepth?: number;
  /** Charcoal and wood broilers. */
  fuelDepth?: number;
}

export interface Duct {
  id: string;
  /** Centre of the duct opening, measured from the left end of the hood. */
  position: number;
  shape: "rect" | "round";
  sideA: number;
  sideB: number;
  diameter: number;
}

export interface Design {
  name: string;
  hood: {
    length: number;
    depth: number;
    /** Height of the hood's lower edge above the cooking surfaces. */
    clearance: number;
    filterBank: FilterBank;
    plenumWidth: number;
    /** Where the cooking line starts, from the left end of the hood. */
    lineOffset: number;
  };
  ducts: Duct[];
  line: Appliance[];
  detection: { style: DetectorStyle; ambientF: number };
  gasValve: { type: GasValveType; size: string };
  /** Run lengths measured on a plan, when one was used. */
  site?: {
    /** Agent pipe from the tank to the nearest nozzle, following the route drawn on the plan. */
    pipeToFirstNozzle?: number;
    /** Cable from the release to the manual pull station. */
    pullCable?: number;
    /** Cable from the release to a mechanical gas valve. */
    gasCable?: number;
  };
}

/* ----------------------------------------------------------------- output */

export type Zone = "duct" | "plenum" | "appliance";

export interface Nozzle {
  zone: Zone;
  ref: string;
  code: NozzleCode;
  /** Position along the hood, from its left end. */
  x: number;
  /** Tip height above the cooking surface (appliance zone only). */
  tip?: number;
  flow: number;
}

export interface Protection {
  ref: string;
  zone: Zone;
  title: string;
  ok: boolean;
  /** One line such as "1 × 3N at 25–35 in." */
  summary: string;
  flow: number;
  placement?: string;
  /** Other heights where a nozzle would cover this hazard. */
  alternatives?: Alternative[];
  reason?: string;
}

export interface Alternative {
  label: string;
  height: [number, number];
}

export type Level = "stop" | "check" | "note";

export interface Finding {
  level: Level;
  ref?: string;
  text: string;
}

export interface BomLine {
  item: string;
  qty: number;
}

export interface Result {
  protections: Protection[];
  nozzles: Nozzle[];
  flow: { duct: number; plenum: number; appliance: number; total: number };
  system: SystemRow | null;
  piping: Piping | null;
  detectors: { x: number; ref: string; reason: string }[];
  link: (typeof FUSIBLE_LINKS)[number] | null;
  findings: Finding[];
  bom: BomLine[];
  applianceX: Record<string, { start: number; end: number }>;
}

/* ----------------------------------------------------------------- labels */

export const KIND_LABEL: Record<ApplianceKind, string> = {
  fryer: "Fryer",
  "tilt-skillet": "Tilt skillet",
  range: "Range",
  griddle: "Griddle",
  "charbroiler-gas": "Char-broiler, gas radiant",
  "charbroiler-lava": "Char-broiler, lava rock",
  "charbroiler-charcoal": "Charcoal broiler",
  "charbroiler-wood": "Wood-fired broiler",
  wok: "Wok",
  salamander: "Salamander",
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(n * 8 === Math.round(n * 8) ? 3 : 1).replace(/0+$/, "").replace(/\.$/, ""));
const range = (h: [number, number]) => `${fmt(h[0])}–${fmt(h[1])} in.`;
const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

/* ----------------------------------------------------------- appliances */

interface Candidate {
  code: NozzleCode;
  qty: number;
  height: [number, number] | null;
  placement: string;
  modules?: number;
}

/** Every way the manual allows this hazard to be covered, ignoring nozzle height. */
function candidates(a: Appliance): { list: Candidate[]; reason?: string } {
  const L = a.surfaceLength;
  const D = a.surfaceDepth;
  const side = Math.max(L, D);
  const area = L * D;

  const surface = (rows: SurfaceRow[], fuel?: number) => {
    const list = rows
      .filter((r) => side <= r.maxSide && area <= r.maxArea && (r.maxFuelDepth === undefined || (fuel ?? 0) <= r.maxFuelDepth))
      .map<Candidate>((r) => ({ code: r.nozzle, qty: r.qty, height: r.height, placement: r.placement }));
    if (list.length) return { list };
    const biggest = rows.reduce((m, r) => (r.maxArea > m.maxArea ? r : m));
    if (fuel !== undefined && rows.every((r) => r.maxFuelDepth !== undefined && fuel > r.maxFuelDepth)) {
      return { list, reason: `Fuel bed of ${fmt(fuel)} in. is deeper than the ${fmt(rows[0].maxFuelDepth!)} in. one nozzle is listed for.` };
    }
    return { list, reason: `Surface ${fmt(L)} × ${fmt(D)} in. is larger than one nozzle covers (${fmt(biggest.maxSide)} in. longest side, ${fmt(biggest.maxArea)} sq. in.).` };
  };

  switch (a.kind) {
    case "range":
      return surface(RANGE);
    case "griddle":
      return surface(GRIDDLE);
    case "charbroiler-gas":
      return surface(CHARBROILER_GAS);
    case "charbroiler-lava":
      return surface(CHARBROILER_LAVA);
    case "charbroiler-charcoal":
      return surface(CHARBROILER_CHARCOAL, a.fuelDepth ?? 0);
    case "charbroiler-wood":
      return surface(CHARBROILER_WOOD, a.fuelDepth ?? 0);
    case "wok": {
      const d = a.wokDiameter ?? 0;
      const dp = a.wokDepth ?? 0;
      const list = WOK.filter((w) => within(d, w.diameter) && within(dp, w.depth)).map<Candidate>((w) => ({
        code: w.nozzle,
        qty: 1,
        height: w.height,
        placement: w.placement,
      }));
      return list.length
        ? { list }
        : { list, reason: `A ${fmt(d)} in. wok, ${fmt(dp)} in. deep, is outside both listed wok nozzles (11–30 in. across, 3–8 in. deep).` };
    }
    case "salamander": {
      const [s, l] = [Math.min(L, D), Math.max(L, D)];
      const list = SALAMANDER.filter((r) => s <= Math.min(...r.chamber) && l <= Math.max(...r.chamber)).map<Candidate>((r) => ({
        code: r.nozzle,
        qty: r.qty,
        height: null,
        placement: r.placement,
      }));
      return list.length ? { list } : { list, reason: `Chamber ${fmt(L)} × ${fmt(D)} in. is larger than 30 × 32.5 in.` };
    }
    case "fryer":
      return fryerCandidates(a);
    case "tilt-skillet":
      return moduleCandidates(a, false);
  }
}

function fryerCandidates(a: Appliance) {
  const drip = !!a.dripboard;
  const potD = drip ? a.potDepth ?? a.surfaceDepth : a.surfaceDepth;
  const potL = drip ? a.potLength ?? a.surfaceLength : a.surfaceLength;
  const list: Candidate[] = FRYER_SINGLE.filter((r) => {
    if (r.nonSplitOnly && a.splitVat) return false;
    const potFits = potD <= r.pot[0] && potL <= r.pot[1];
    if (!drip) return potFits;
    return potFits && a.surfaceDepth <= r.overall[0] && a.surfaceLength <= r.overall[1];
  }).map((r) => ({ code: r.nozzle, qty: 1, height: r.height, placement: r.placement }));
  if (list.length) return { list };
  return moduleCandidates(a, true);
}

/**
 * Split the vat side to side into equal modules until each module is inside a
 * multi-nozzle row. Tilt skillets use the same rows with the
 * "overall with dripboard" column and no 864 sq. in. ceiling.
 */
function moduleCandidates(a: Appliance, isFryer: boolean): { list: Candidate[]; reason?: string } {
  const overallArea = a.surfaceLength * a.surfaceDepth;
  if (isFryer && overallArea > FRYER_MAX_MODULAR_AREA) {
    return { list: [], reason: `Vat area ${fmt(overallArea)} sq. in. is over the 864 sq. in. that a fryer may be split into.` };
  }
  const drip = isFryer ? !!a.dripboard : true;
  const potD = isFryer && drip ? a.potDepth ?? a.surfaceDepth : a.surfaceDepth;
  const potL = isFryer && drip ? a.potLength ?? a.surfaceLength : a.surfaceLength;
  const list: Candidate[] = [];
  for (const r of FRYER_MODULE) {
    for (let k = 2; k <= 8; k++) {
      const potSide = Math.max(potD, potL / k);
      const potArea = (potD * potL) / k;
      const allSide = Math.max(a.surfaceDepth, a.surfaceLength / k);
      const allArea = overallArea / k;
      const potOk = isFryer ? potSide <= r.pot[0] && potArea <= r.pot[1] : true;
      const overallOk = allSide <= r.overall[0] && allArea <= r.overall[1];
      if (potOk && overallOk) {
        list.push({
          code: r.nozzle,
          qty: k,
          height: r.height,
          modules: k,
          placement: "Each module gets its own nozzle, tip along or inside that module's perimeter, aimed at the module's centre.",
        });
        break;
      }
    }
  }
  return list.length
    ? { list }
    : { list, reason: "No even split of this vat fits the multi-nozzle limits; it needs a custom module layout from the manual." };
}

const alt = (c: Candidate): Alternative => ({ label: `${c.qty} × ${c.code} at ${range(c.height!)}`, height: c.height! });
const dedupe = (xs: Alternative[]) => xs.filter((x, i) => xs.findIndex((y) => y.label === x.label) === i);

function protectAppliance(a: Appliance, index: number): { p: Protection; chosen?: Candidate } {
  const title = `${index + 1}. ${KIND_LABEL[a.kind]}`;
  const { list, reason } = candidates(a);
  if (!list.length) {
    return { p: { ref: a.id, zone: "appliance", title, ok: false, summary: "Not covered", flow: 0, reason } };
  }
  const atHeight = list.filter((c) => c.height === null || within(a.tipHeight, c.height));
  const cost = (c: Candidate) => c.qty * NOZZLES[c.code].flow;
  if (!atHeight.length) {
    const alts = [...list].sort((x, y) => cost(x) - cost(y)).map((c) => alt(c));
    return {
      p: {
        ref: a.id,
        zone: "appliance",
        title,
        ok: false,
        summary: `No nozzle at ${fmt(a.tipHeight)} in.`,
        flow: 0,
        reason: `No listed nozzle covers this hazard with the tip ${fmt(a.tipHeight)} in. above it.`,
        alternatives: dedupe(alts),
      },
    };
  }
  const chosen = [...atHeight].sort((x, y) => cost(x) - cost(y) || (x.qty - y.qty))[0];
  const others = list
    .filter((c) => c !== chosen && c.height && !within(a.tipHeight, c.height) && cost(c) < cost(chosen))
    .map((c) => alt(c));
  return {
    chosen,
    p: {
      ref: a.id,
      zone: "appliance",
      title,
      ok: true,
      summary: `${chosen.qty} × ${chosen.code}${chosen.height ? ` at ${range(chosen.height)}` : ""}${chosen.modules ? `, ${chosen.modules} modules` : ""}`,
      flow: cost(chosen),
      placement: chosen.placement,
      alternatives: others.length ? dedupe(others) : undefined,
    },
  };
}

/* ---------------------------------------------------------------- ducts */

function protectDuct(d: Duct, index: number): { p: Protection; codes: NozzleCode[] } {
  const title = `Duct ${index + 1}`;
  const base = { ref: d.id, zone: "duct" as const, title };
  if (d.shape === "round") {
    if (d.diameter <= DUCT.oneW.diameter)
      return { codes: ["1W"], p: { ...base, ok: true, summary: `1 × 1W, ${fmt(d.diameter)} in. round`, flow: 1, placement: "Centred, 2–8 in. into the duct opening, discharging up." } };
    if (d.diameter <= DUCT.twoW.diameter)
      return { codes: ["2W"], p: { ...base, ok: true, summary: `1 × 2W, ${fmt(d.diameter)} in. round`, flow: 2, placement: "Centred, 2–8 in. into the duct opening, discharging up." } };
    return { codes: [], p: { ...base, ok: false, summary: "Outside this tool", flow: 0, reason: `A ${fmt(d.diameter)} in. round duct is over 31 7/8 in.; round ducts have no listed three-flow option.` } };
  }
  const perim = 2 * (d.sideA + d.sideB);
  if (perim <= DUCT.oneW.perimeter)
    return { codes: ["1W"], p: { ...base, ok: true, summary: `1 × 1W, ${fmt(perim)} in. perimeter`, flow: 1, placement: "Centred, 2–8 in. into the duct opening, discharging up." } };
  if (perim <= DUCT.twoW.perimeter)
    return { codes: ["2W"], p: { ...base, ok: true, summary: `1 × 2W, ${fmt(perim)} in. perimeter`, flow: 2, placement: "Centred, 2–8 in. into the duct opening, discharging up." } };
  if (perim <= DUCT.threeFlow.perimeter) {
    const a = Math.min(d.sideA, d.sideB);
    const b = Math.max(d.sideA, d.sideB);
    const row = THREE_FLOW_MAX_B.find(([sa]) => sa >= Math.ceil(a));
    if (row && b <= row[1])
      return {
        codes: ["1W", "2W"],
        p: { ...base, ok: true, summary: `1W + 2W, ${fmt(perim)} in. perimeter`, flow: 3, placement: "Duct split into a 1W module and a 2W module along the long side, each nozzle centred in its module." },
      };
    return { codes: [], p: { ...base, ok: false, summary: "Too long for 1W + 2W", flow: 0, reason: `Side B of ${fmt(b)} in. is over the ${row ? fmt(row[1]) : "listed"} in. Figure 2 allows for a ${fmt(a)} in. side A.` } };
  }
  return { codes: [], p: { ...base, ok: false, summary: "Outside this tool", flow: 0, reason: `A ${fmt(perim)} in. perimeter needs modular 2W protection from the manual's charts (over 135 in.).` } };
}

/* ---------------------------------------------------------------- plenum */

function protectPlenum(design: Design) {
  const lengthFt = design.hood.length / 12;
  const options = PLENUM_METHODS.filter(
    (m) => m.banks.includes(design.hood.filterBank) && (m.maxWidth === undefined || design.hood.plenumWidth <= m.maxWidth),
  ).map((m) => {
    const qty = Math.ceil(lengthFt / m.coversFt) * m.perStretch;
    return { m, qty, flow: qty * NOZZLES[m.nozzle].flow };
  });
  if (!options.length) {
    return {
      p: { ref: "plenum", zone: "plenum" as const, title: "Plenum", ok: false, summary: "Not covered", flow: 0, reason: "The plenum is wider than 4 ft, which no listed method covers." } satisfies Protection,
      method: null,
      qty: 0,
    };
  }
  const best = options.sort((x, y) => x.flow - y.flow || x.qty - y.qty)[0];
  return {
    p: {
      ref: "plenum",
      zone: "plenum" as const,
      title: "Plenum",
      ok: true,
      summary: `${best.qty} × ${best.m.nozzle}, ${best.m.label}`,
      flow: best.flow,
      placement: best.m.placement,
    } satisfies Protection,
    method: best.m,
    qty: best.qty,
  };
}

/* ----------------------------------------------------------------- solve */

export function solve(design: Design): Result {
  const findings: Finding[] = [];
  const protections: Protection[] = [];
  const nozzles: Nozzle[] = [];
  const { hood } = design;

  // Lay the line out from the left.
  const applianceX: Result["applianceX"] = {};
  let x = hood.lineOffset;
  for (const a of design.line) {
    const start = a.x ?? x;
    applianceX[a.id] = { start, end: start + a.width };
    x = start + a.width;
  }
  const spans = design.line.map((a) => applianceX[a.id]);
  const lineStart = spans.length ? Math.min(...spans.map((s) => s.start)) : hood.lineOffset;
  const lineEnd = spans.length ? Math.max(...spans.map((s) => s.end)) : hood.lineOffset;

  // Ducts
  design.ducts.forEach((d, i) => {
    const { p, codes } = protectDuct(d, i);
    protections.push(p);
    codes.forEach((code, k) =>
      nozzles.push({ zone: "duct", ref: d.id, code, x: d.position + (codes.length > 1 ? (k - 0.5) * d.sideB * 0.4 : 0), flow: NOZZLES[code].flow }),
    );
    if (d.position < 0 || d.position > hood.length) findings.push({ level: "stop", ref: d.id, text: `${p.title} sits outside the hood.` });
  });

  // Plenum
  const plenum = protectPlenum(design);
  protections.push(plenum.p);
  if (plenum.method) {
    const n = plenum.qty / plenum.method.perStretch;
    for (let i = 0; i < n; i++) {
      const pos = n === 1 ? Math.min(hood.length / 2, plenum.method.coversFt * 6) : (hood.length / n) * (i + 0.5);
      for (let s = 0; s < plenum.method.perStretch; s++)
        nozzles.push({ zone: "plenum", ref: "plenum", code: plenum.method.nozzle, x: pos, flow: NOZZLES[plenum.method.nozzle].flow });
    }
  }

  // Appliances
  design.line.forEach((a, i) => {
    const { p, chosen } = protectAppliance(a, i);
    protections.push(p);
    if (!p.ok) {
      findings.push({ level: "stop", ref: a.id, text: `${p.title}: ${p.reason}${p.alternatives?.length ? ` Try ${p.alternatives[0].label}.` : ""}` });
    }
    if (chosen) {
      const { start, end } = applianceX[a.id];
      for (let k = 0; k < chosen.qty; k++) {
        const pos = start + ((end - start) / chosen.qty) * (k + 0.5);
        nozzles.push({ zone: "appliance", ref: a.id, code: chosen.code, x: pos, tip: a.tipHeight, flow: NOZZLES[chosen.code].flow });
      }
      if (a.tipHeight > hood.clearance && chosen.height !== null) {
        findings.push({ level: "check", ref: a.id, text: `${p.title}: the tip at ${fmt(a.tipHeight)} in. is above the hood edge (${fmt(hood.clearance)} in.). Check the nozzle can still see the whole surface.` });
      }
      if (chosen.code === "1N" && (a.kind === "wok" || a.kind === "griddle" || a.kind === "range" || a.kind === "salamander")) {
        findings.push({ level: "note", ref: a.id, text: `${p.title}: a 1N on a ${KIND_LABEL[a.kind].toLowerCase()} holds the tank to its basic flow limit (5 on 1.5 gal, 11 on 3.0 gal).` });
      }
    }
    if (a.kind === "range" && (a.wokDiameter ?? 0) > 13) findings.push({ level: "stop", ref: a.id, text: `${p.title}: woks over 13 in. cannot be protected on a range.` });
  });

  // Geometry
  if (design.line.length && lineEnd > hood.length) {
    findings.push({ level: "stop", text: `The line runs ${fmt(lineEnd - hood.length)} in. past the end of the hood. Every cooking surface has to sit under it.` });
  }
  if (design.line.length) {
    const left = lineStart;
    const right = hood.length - lineEnd;
    if (left < 0) findings.push({ level: "stop", text: `The line starts ${fmt(-left)} in. before the left end of the hood. Every cooking surface has to sit under it.` });
    const sorted = design.line.map((a, i) => ({ a, i, ...applianceX[a.id] })).sort((p, q) => (p.a.row ?? 0) - (q.a.row ?? 0) || p.start - q.start);
    for (let k = 1; k < sorted.length; k++) {
      if ((sorted[k - 1].a.row ?? 0) !== (sorted[k].a.row ?? 0)) continue;
      // A salamander hangs above the range it serves; sharing floor space with it is normal.
      if (sorted[k - 1].a.kind === "salamander" || sorted[k].a.kind === "salamander") continue;
      const overlap = sorted[k - 1].end - sorted[k].start;
      if (overlap > 0.5)
        findings.push({ level: "stop", ref: sorted[k].a.id, text: `${sorted[k - 1].i + 1}. ${KIND_LABEL[sorted[k - 1].a.kind]} and ${sorted[k].i + 1}. ${KIND_LABEL[sorted[k].a.kind]} overlap by ${fmt(overlap)} in.` });
    }
    if (left < 6 || right < 6)
      findings.push({ level: "check", text: `The hood overhangs the line by ${fmt(Math.max(0, left))} in. on the left and ${fmt(Math.max(0, right))} in. on the right. Many codes ask for at least 6 in. on open sides (local code decides).` });
  }
  if (!design.ducts.length) findings.push({ level: "stop", text: "The hood has no exhaust duct." });

  // Flow and system
  const sum = (z: Zone) => protections.filter((p) => p.zone === z).reduce((s, p) => s + p.flow, 0);
  const flow = { duct: sum("duct"), plenum: sum("plenum"), appliance: sum("appliance"), total: 0 };
  flow.total = flow.duct + flow.plenum + flow.appliance;
  let system = SYSTEMS.find((s) => flow.total >= s.min && flow.total <= s.max) ?? null;
  if (flow.total > SYSTEMS[SYSTEMS.length - 1].max) {
    findings.push({ level: "stop", text: `${fmt(flow.total)} flow numbers is past the 110 the selection guide lists. Split the line into separate systems, each with its own release.` });
  }

  // Distribution piping, tank by tank
  const piping = system
    ? planPiping({ nozzles, hood: { length: hood.length, clearance: hood.clearance }, tankToHood: design.site?.pipeToFirstNozzle }, system)
    : null;
  if (system && !piping && nozzles.length) {
    findings.push({ level: "stop", text: "The nozzles cannot be shared out between the tanks of any listed system without one tank going over its flow." });
  }
  if (piping) {
    if (piping.steppedUp) {
      findings.push({
        level: "check",
        text: `The nozzles do not share out between ${system!.tanks} tank${system!.tanks > 1 ? "s" : ""} without one going over its flow, so the next size up is taken: ${piping.system.tanks} tanks, ${fmt(piping.system.gallons)} gal.`,
      });
      system = piping.system;
    }
    piping.tanks.forEach((t, k) => {
      const name = piping.tanks.length > 1 ? `Tank ${k + 1} (${t.gallons} gal)` : `The ${t.gallons} gal tank`;
      for (const p of t.problems) findings.push({ level: "check", text: `${name}: ${p}` });
      t.branches.forEach((b) => b.problems.forEach((p) => findings.push({ level: "check", text: `${name}, ${b.kind} branch at ${fmt(Math.round(b.start))} in.: ${p}` })));
    });
  }

  // Detection
  const detectors: Result["detectors"] = [];
  design.ducts.forEach((d, i) => detectors.push({ x: d.position, ref: d.id, reason: `Duct ${i + 1} entrance` }));
  design.line.forEach((a, i) => {
    const { start, end } = applianceX[a.id];
    const underDuct = design.ducts.some((d) => {
      const half = (d.shape === "round" ? d.diameter : d.sideB) / 2;
      return d.position + half > start && d.position - half < end;
    });
    const need = Math.ceil(a.surfaceLength / DETECTOR_SURFACE) * Math.ceil(a.surfaceDepth / DETECTOR_SURFACE);
    if (underDuct && need === 1) return;
    for (let k = 0; k < need; k++)
      detectors.push({ x: start + ((end - start) / need) * (k + 0.5), ref: a.id, reason: `${i + 1}. ${KIND_LABEL[a.kind]}` });
  });
  // The wire rope runs from the release outwards: the farthest detector is the terminal one.
  detectors.sort((p, q) => p.x - q.x);
  const style = DETECTOR_STYLES[design.detection.style];
  if (detectors.length > style.maxDetectors) {
    findings.push({ level: "stop", text: `${detectors.length} detectors is more than one ${style.label.toLowerCase()} detection line takes (${style.maxDetectors}). Use scissors-style detectors or add a remote release.` });
  }
  const link = FUSIBLE_LINKS.find((l) => design.detection.ambientF <= l.maxAmbientF) ?? null;
  if (!link) findings.push({ level: "stop", text: `No fusible link is listed for ${design.detection.ambientF} °F at the detector.` });

  // Runs measured on a plan
  const site = design.site;
  if (site?.pullCable !== undefined && site.pullCable > PULL_STATION.maxCableFt * 12)
    findings.push({ level: "stop", text: `The pull station cable runs about ${fmt(Math.round(site.pullCable / 12))} ft; the limit is ${PULL_STATION.maxCableFt} ft.` });
  if (site?.gasCable !== undefined && design.gasValve.type === "mechanical" && site.gasCable > 150 * 12)
    findings.push({ level: "stop", text: `The gas valve cable runs about ${fmt(Math.round(site.gasCable / 12))} ft; a mechanical valve allows 150 ft.` });
  if (site?.pipeToFirstNozzle !== undefined && site.pipeToFirstNozzle < 72 && design.line.some((a) => a.kind === "fryer" || a.kind === "range" || a.kind === "wok"))
    findings.push({ level: "check", text: `The plan gives about ${fmt(Math.round(site.pipeToFirstNozzle))} in. of pipe to the first nozzle. Nozzles over a fryer, range or wok need at least 6 ft (72 in.) from the tank; add pipe if this run feeds one.` });
  if (site?.pipeToFirstNozzle !== undefined && site.pipeToFirstNozzle > 40 * 12)
    findings.push({ level: "check", text: `About ${fmt(Math.round(site.pipeToFirstNozzle / 12))} ft of supply pipe before the first nozzle; the supply line may not exceed 40 ft. Move the tank closer.` });

  // Standing notes
  findings.push({ level: "note", text: `Mount the manual pull station ${PULL_STATION.heightIn[0]}–${PULL_STATION.heightIn[1]} in. above the floor, in the path of egress; ${PULL_STATION.maxCableFt} ft of cable and ${PULL_STATION.maxElbows} pulley elbows at most.` });
  if (design.gasValve.type === "electrical")
    findings.push({ level: "note", text: "An electric gas valve must be wired through a snap-action switch and a manual reset relay; it closes on power loss too." });

  // Bill of materials
  const bom: BomLine[] = [];
  const add = (item: string, qty = 1) => {
    const hit = bom.find((b) => b.item === item);
    if (hit) hit.qty += qty;
    else bom.push({ item, qty });
  };
  const counted = (s: string): [string, number] => {
    const m = s.match(/^\((\d+)\) (.*)$/);
    return m ? [m[2], Number(m[1])] : [s, 1];
  };
  if (system) {
    system.hardware.forEach((h) => add(...counted(h)));
    system.cartridges.forEach((c) => {
      const [item, qty] = counted(c);
      add(item.startsWith("CO2") ? item : `Nitrogen cartridge ${item}`, qty);
    });
    add("Wet chemical agent, gallons", system.gallons);
  }
  const codes = [...new Set(nozzles.map((n) => n.code))].sort();
  for (const c of codes) add(`Nozzle ${c}`, nozzles.filter((n) => n.code === c).length);
  if (detectors.length) {
    add("Series detector", detectors.length - 1);
    add("Terminal detector", 1);
    if (link) add(`Fusible link ${link.ratingF} °F (${link.style} style)`, detectors.length);
  }
  add("Remote manual pull station");
  const valve = GAS_VALVES[design.gasValve.type].find((v) => v.size === design.gasValve.size) ?? GAS_VALVES[design.gasValve.type][0];
  add(`Gas shut-off valve ${valve.size}, ${design.gasValve.type}`);
  if (design.gasValve.type === "electrical") {
    add("Manual reset relay");
    add("Snap-action switch kit");
  }
  const cleaned = bom.filter((b) => b.qty > 0);

  return { protections, nozzles, flow, system, piping, detectors, link, findings, bom: cleaned, applianceX };
}

/* --------------------------------------------------------------- helpers */

let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export function defaultAppliance(kind: ApplianceKind, id: string): Appliance {
  switch (kind) {
    case "fryer":
      return { id, kind, width: 16, surfaceLength: 18, surfaceDepth: 14, potLength: 14, potDepth: 14, dripboard: true, tipHeight: 30 };
    case "tilt-skillet":
      return { id, kind, width: 48, surfaceLength: 36, surfaceDepth: 24, tipHeight: 30 };
    case "range":
      return { id, kind, width: 36, surfaceLength: 24, surfaceDepth: 24, tipHeight: 35 };
    case "griddle":
      return { id, kind, width: 36, surfaceLength: 36, surfaceDepth: 24, tipHeight: 25 };
    case "charbroiler-gas":
      return { id, kind, width: 36, surfaceLength: 34, surfaceDepth: 22, tipHeight: 30 };
    case "charbroiler-lava":
      return { id, kind, width: 30, surfaceLength: 28, surfaceDepth: 22, tipHeight: 30 };
    case "charbroiler-charcoal":
      return { id, kind, width: 30, surfaceLength: 28, surfaceDepth: 22, fuelDepth: 3, tipHeight: 30 };
    case "charbroiler-wood":
      return { id, kind, width: 30, surfaceLength: 28, surfaceDepth: 22, fuelDepth: 5, tipHeight: 30 };
    case "wok":
      return { id, kind, width: 30, surfaceLength: 20, surfaceDepth: 20, wokDiameter: 20, wokDepth: 5, tipHeight: 38 };
    case "salamander":
      return { id, kind, width: 36, surfaceLength: 28, surfaceDepth: 14, tipHeight: 30 };
  }
}
