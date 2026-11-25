// Distribution piping: which tank feeds which nozzles, the branch lines each
// tank needs, and the lengths those runs come to against the manual's limits.
// Lengths are estimates from the hood geometry, not a routed design: the
// supply line is taken along the top of the hood, branches drop or rise
// straight to their nozzles.

import { PIPING, SYSTEMS, type BranchLimit, type PipingLimit, type SystemRow } from "./rules";

export type BranchKind = "duct" | "plenum" | "appliance";

export interface PipeNozzle {
  zone: BranchKind;
  ref: string;
  flow: number;
  x: number;
  /** Tip height above the cooking surface (appliance nozzles). */
  tip?: number;
}

export interface Branch {
  kind: BranchKind;
  /** Indexes into the nozzle list given to planPiping. */
  nozzles: number[];
  flow: number;
  /** Where the branch leaves the supply line, along the hood. */
  start: number;
  length: number;
  tees: number;
  limit: BranchLimit & { nozzles?: number };
  problems: string[];
}

export interface TankRun {
  gallons: number;
  capacity: number;
  flow: number;
  nozzles: number[];
  branches: Branch[];
  /** Tank outlet to the start of the last branch line. */
  supply: number;
  firstToLast: number;
  branchTotal: number;
  limits: PipingLimit;
  problems: string[];
}

export interface Piping {
  system: SystemRow;
  /** True when the nozzles did not pack into the smallest system for the flow and one size up was taken. */
  steppedUp: boolean;
  tanks: TankRun[];
  /** Which tank feeds each nozzle, by nozzle index. */
  tankOf: number[];
  assumptions: string[];
}

export interface PipingInput {
  nozzles: PipeNozzle[];
  /** Hood length, its lower edge above the cooking surfaces. */
  hood: { length: number; clearance: number };
  /** Pipe from the tank to where the supply line meets the hood. */
  tankToHood?: number;
}

/** Height of the canopy itself; the supply line runs on top of it. */
const CANOPY = 24;
/** Assumed run from the tank to the hood when no plan gives one. */
const DEFAULT_TANK_TO_HOOD = 120;
/** A duct nozzle sits 2–8 in. into the duct; a plenum nozzle about a foot below the top. */
const DUCT_RISE = 8;
const PLENUM_DROP = 12;

const limitsFor = (gallons: number) => PIPING[gallons === 1.5 ? "1.5" : "3"];

/** Split the nozzles, left to right, into consecutive runs no larger than each tank's flow. */
function pack(order: number[], nozzles: PipeNozzle[], sizes: number[]): number[][] | null {
  const groups: number[][] = sizes.map(() => []);
  let t = 0;
  let load = 0;
  for (const i of order) {
    const f = nozzles[i].flow;
    while (t < sizes.length && load + f > limitsFor(sizes[t]).flow) {
      t++;
      load = 0;
    }
    if (t >= sizes.length) return null;
    groups[t].push(i);
    load += f;
  }
  return groups;
}

function assign(nozzles: PipeNozzle[], sizes: number[]): number[][] | null {
  const order = nozzles.map((_, i) => i).sort((a, b) => nozzles[a].x - nozzles[b].x);
  // Try the tanks in the guide's order, then reversed, so a small tank can take either end.
  return pack(order, nozzles, sizes) ?? pack(order, nozzles, [...sizes].reverse())?.reverse() ?? null;
}

function branchesFor(idx: number[], nozzles: PipeNozzle[], lim: PipingLimit, supplyHeight: number): Branch[] {
  const out: Branch[] = [];
  const sorted = [...idx].sort((a, b) => nozzles[a].x - nozzles[b].x);
  for (const kind of ["duct", "plenum", "appliance"] as const) {
    const limit: BranchLimit & { nozzles?: number } = lim[kind];
    const reach = (n: PipeNozzle) =>
      kind === "duct" ? DUCT_RISE : kind === "plenum" ? PLENUM_DROP : Math.max(6, supplyHeight - (n.tip ?? supplyHeight - 12));
    let cur: Branch | null = null;
    for (const i of sorted.filter((k) => nozzles[k].zone === kind)) {
      const n = nozzles[i];
      const sameDuct = kind !== "duct" || (cur && nozzles[cur.nozzles[0]].ref === n.ref);
      const span = cur ? n.x - cur.start : 0;
      const length = cur ? Math.max(cur.length, reach(n) + span) : reach(n);
      const fits =
        cur && sameDuct && cur.flow + n.flow <= limit.flow && cur.tees + 1 <= limit.tees && length <= limit.length && (!limit.nozzles || cur.nozzles.length < limit.nozzles);
      if (cur && fits) {
        cur.nozzles.push(i);
        cur.flow += n.flow;
        cur.tees += 1;
        cur.length = length;
      } else {
        cur = { kind, nozzles: [i], flow: n.flow, start: n.x, length: reach(n), tees: 1, limit, problems: [] };
        out.push(cur);
      }
    }
  }
  for (const b of out) {
    if (b.flow > b.limit.flow) b.problems.push(`${b.flow} flow numbers on one ${b.kind} branch line; the limit is ${b.limit.flow}.`);
    if (b.length > b.limit.length) b.problems.push(`about ${Math.round(b.length)} in. long; a ${b.kind} branch line may be ${b.limit.length} in.`);
  }
  return out.sort((a, b) => a.start - b.start);
}

export function planPiping(input: PipingInput, base: SystemRow): Piping | null {
  const { nozzles, hood } = input;
  if (!nozzles.length) return null;
  const supplyHeight = hood.clearance + CANOPY;
  const tankToHood = input.tankToHood ?? DEFAULT_TANK_TO_HOOD;

  let system = base;
  let groups = assign(nozzles, system.tankSizes);
  let steppedUp = false;
  for (let k = SYSTEMS.indexOf(base) + 1; !groups && k < SYSTEMS.length; k++) {
    system = SYSTEMS[k];
    groups = assign(nozzles, system.tankSizes);
    steppedUp = true;
  }
  if (!groups) return null;

  const tankOf: number[] = new Array(nozzles.length).fill(0);
  const tanks: TankRun[] = groups.map((idx, t) => {
    idx.forEach((i) => (tankOf[i] = t));
    const gallons = system.tankSizes[t];
    const limits = limitsFor(gallons);
    const branches = branchesFor(idx, nozzles, limits, supplyHeight);
    const starts = branches.map((b) => b.start);
    const first = starts.length ? Math.min(...starts) : 0;
    const last = starts.length ? Math.max(...starts) : 0;
    // The supply enters at the left end of the hood and runs right along its top.
    const supply = tankToHood + Math.max(0, last);
    const firstToLast = last - first;
    const branchTotal = branches.reduce((s, b) => s + b.length, 0);
    const flow = idx.reduce((s, i) => s + nozzles[i].flow, 0);
    const problems: string[] = [];
    if (firstToLast > limits.firstToLast)
      problems.push(`${Math.round(firstToLast / 12)} ft from the first branch line to the last; a ${gallons} gal tank allows ${limits.firstToLast / 12} ft.`);
    if (branchTotal > limits.branchTotal)
      problems.push(`about ${Math.round(branchTotal / 12)} ft of branch lines; a ${gallons} gal tank allows ${limits.branchTotal / 12} ft.`);
    if (supply > limits.supply.length)
      problems.push(`about ${Math.round(supply / 12)} ft of supply line; the limit is ${limits.supply.length / 12} ft. Move the tank closer or feed this end from a tank nearer to it.`);
    if (gallons === 1.5) {
      const ductNozzles = idx.filter((i) => nozzles[i].zone === "duct").length;
      const onlyDuctPlenum = idx.every((i) => nozzles[i].zone !== "appliance");
      if (onlyDuctPlenum && ductNozzles > 1) problems.push("with plenum and duct protection only, a 1.5 gal tank takes one duct nozzle.");
    }
    return { gallons, capacity: limits.flow, flow, nozzles: idx, branches, supply, firstToLast, branchTotal, limits, problems };
  });

  const assumptions = [
    `Supply line along the top of the hood, ${CANOPY} in. above its lower edge, entering at the left end.`,
    input.tankToHood === undefined
      ? `${DEFAULT_TANK_TO_HOOD / 12} ft of pipe assumed from the tank to the hood (no plan route).`
      : `${Math.round(tankToHood / 12)} ft from the tank to the hood, measured on the plan.`,
    "Branch lengths are the drop or rise to each nozzle plus the run along the hood between its nozzles; fittings are not counted.",
    "Tanks take the nozzles left to right at their basic flow (5 on 1.5 gal, 11 on 3.0 gal); the manual's 6 and 12 flow exceptions are not used.",
  ];
  return { system, steppedUp, tanks, tankOf, assumptions };
}
