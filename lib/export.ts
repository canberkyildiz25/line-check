import { Dxf } from "./dxf";
import { KIND_LABEL, type Design, type Result } from "./engine";
import { overlay, pipeRoute, type Plan } from "./plan";

export interface DxfSystem {
  design: Design;
  result: Result;
  /** The hood's own view of the plan (viewOf), or null without a plan. */
  plan: Plan | null;
}

/**
 * The design as a DXF overlay. With a plan, everything sits in the drawing's
 * own coordinates and units, so it lands on the original when inserted at
 * 0,0; every hood is drawn with its own appliances, pipe and detection. Below
 * the plan, each hood gets a front elevation and a protection schedule.
 */
export function designToDxf(systems: DxfSystem[]): string {
  const first = systems[0]?.plan ?? null;
  const k = first?.inchesPerUnit ?? 1; // inches per drawing unit
  const u = (inches: number) => inches / k; // inches → drawing units
  const units = first ? unitsCode(first.inchesPerUnit) : 1;
  const d = new Dxf(units)
    .layer({ name: "LC-HOOD", color: 8 })
    .layer({ name: "LC-APPLIANCE", color: 7 })
    .layer({ name: "LC-PIPE", color: 1 })
    .layer({ name: "LC-NOZZLE", color: 1 })
    .layer({ name: "LC-DETECTION", color: 5, lineType: "DASHED" })
    .layer({ name: "LC-DEVICE", color: 3 })
    .layer({ name: "LC-TEXT", color: 7 });

  const txt = u(3);
  let origin = { x: 0, y: 0 };
  const many = systems.length > 1;

  // Plan overlay: every hood with its appliances, pipe and detection.
  systems.forEach(({ design, result, plan }, si) => {
    if (!plan?.hood) return;
    const h = plan.hood;
    d.rect("LC-HOOD", h.x, h.y, h.w, h.h).text("LC-TEXT", [h.x, h.y + h.h + txt * 0.6], txt, `${many ? `HOOD ${si + 1}` : "HOOD"} ${Math.round(design.hood.length)} in.`);
    plan.items.forEach((it) => {
      const idx = design.line.findIndex((a) => a.id === it.id);
      if (idx < 0) return;
      d.rect("LC-APPLIANCE", it.x, it.y, it.w, it.h).text("LC-TEXT", [it.x + it.w / 2, it.y + it.h / 2], txt, `${idx + 1} ${KIND_LABEL[design.line[idx].kind].toUpperCase()}`, "center");
    });
    const route = pipeRoute(plan);
    if (route) d.polyline("LC-PIPE", route.map((p) => [p.x, p.y]));
    const ov = overlay(plan, result);
    ov.nozzles.forEach((n) => d.circle("LC-NOZZLE", [n.x, n.y], u(1.5)).text("LC-NOZZLE", [n.x + u(2), n.y + u(2)], txt * 0.8, n.code));
    ov.detectors.forEach((p, i) => d.rect("LC-DETECTION", p.x - u(1.5), p.y - u(1.5), u(3), u(3)).text("LC-DETECTION", [p.x + u(2), p.y - u(4)], txt * 0.7, i === ov.detectors.length - 1 ? "TD" : "SD"));
    if (route && ov.detectors.length) d.polyline("LC-DETECTION", [[route[0].x, route[0].y + u(2)], [route[1].x, route[1].y + u(2)], ...ov.detectors.map((p) => [p.x, p.y] as [number, number])]);
  });
  if (first?.hoods.length) {
    const plan = first;
    if (plan.cabinet) d.rect("LC-DEVICE", plan.cabinet.x - u(8), plan.cabinet.y - u(4), u(16), u(8)).text("LC-DEVICE", [plan.cabinet.x, plan.cabinet.y - u(9)], txt, "RELEASE + TANK", "center");
    if (plan.pull) d.circle("LC-DEVICE", [plan.pull.x, plan.pull.y], u(3)).text("LC-DEVICE", [plan.pull.x, plan.pull.y - u(7)], txt, "PULL STATION", "center");
    if (plan.gas) d.circle("LC-DEVICE", [plan.gas.x, plan.gas.y], u(3)).text("LC-DEVICE", [plan.gas.x, plan.gas.y - u(7)], txt, "GAS VALVE", "center");
    const minX = Math.min(...plan.hoods.map((h) => h.x), plan.cabinet?.x ?? Infinity);
    const minY = Math.min(...plan.hoods.map((h) => h.y), plan.cabinet?.y ?? Infinity);
    origin = { x: minX, y: minY - u(80) };
  }

  // One front elevation and schedule per hood, stacked downwards.
  for (const { design, result } of systems) {
    origin = { x: origin.x, y: elevation(d, design, result, origin, u, txt) - u(80) };
  }
  return d.toString();
}

/** Draws one elevation with its schedule at the origin; returns the lowest y used. */
function elevation(d: Dxf, design: Design, result: Result, origin: { x: number; y: number }, u: (n: number) => number, txt: number): number {
  const ox = origin.x;
  const oy = origin.y;
  const C = design.hood.clearance;
  const L = design.hood.length;
  d.text("LC-TEXT", [ox, oy + u(C + 40)], txt * 1.4, `${design.name.toUpperCase()} - FRONT ELEVATION`);
  d.rect("LC-HOOD", ox, oy + u(C), u(L), u(24));
  design.ducts.forEach((dc) => {
    const w = dc.shape === "round" ? dc.diameter : dc.sideB;
    d.rect("LC-HOOD", ox + u(dc.position - w / 2), oy + u(C + 24), u(w), u(14));
  });
  d.polyline("LC-PIPE", [[ox - u(20), oy + u(C - 10)], [ox - u(20), oy + u(C + 21)], [ox + u(L - 3), oy + u(C + 21)]]);
  design.line.forEach((a, i) => {
    const s = result.applianceX[a.id];
    if (!s) return;
    d.rect("LC-APPLIANCE", ox + u(s.start), oy - u(34), u(s.end - s.start), u(34)).text("LC-TEXT", [ox + u((s.start + s.end) / 2), oy - u(18)], txt, `${i + 1}`, "center");
  });
  result.nozzles
    .filter((n) => n.zone === "appliance")
    .forEach((n) => {
      d.line("LC-PIPE", [ox + u(n.x), oy + u(C + 21)], [ox + u(n.x), oy + u(n.tip ?? 30)]);
      d.circle("LC-NOZZLE", [ox + u(n.x), oy + u(n.tip ?? 30)], u(1.2)).text("LC-NOZZLE", [ox + u(n.x + 2), oy + u((n.tip ?? 30) + 2)], txt * 0.8, n.code);
    });
  result.detectors.forEach((p) => d.rect("LC-DETECTION", ox + u(p.x - 1.5), oy + u(C + 16), u(3), u(3)));

  // Schedule
  let y = oy - u(60);
  d.text("LC-TEXT", [ox, y], txt * 1.2, "PROTECTION SCHEDULE (PRE-DESIGN, NOT FOR CONSTRUCTION)");
  for (const p of result.protections) {
    y -= txt * 1.8;
    d.text("LC-TEXT", [ox, y], txt, `${p.title}: ${p.summary} - ${p.flow} flow`);
  }
  y -= txt * 1.8;
  d.text("LC-TEXT", [ox, y], txt, `TOTAL ${result.flow.total} FLOW NUMBERS${result.system ? ` - ${result.system.tanks} TANK(S), ${result.system.gallons} GAL` : ""} - ${result.detectors.length} DETECTORS`);
  y -= txt * 2.4;
  d.text("LC-TEXT", [ox, y], txt * 0.8, "Line Check pre-design. Final design by a trained, certified designer per the current manual, NFPA 17A and NFPA 96.");
  return y;
}

function unitsCode(inchesPerUnit: number) {
  const table: [number, number][] = [
    [1, 1],
    [12, 2],
    [1 / 25.4, 4],
    [1 / 2.54, 5],
    [100 / 2.54, 6],
  ];
  const hit = table.find(([v]) => Math.abs(v - inchesPerUnit) / v < 0.01);
  return hit ? hit[1] : 0;
}

export function download(name: string, text: string, type = "application/dxf") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
