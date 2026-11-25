"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KIND_LABEL, newId, type Design, type Result } from "@/lib/engine";
import type { Drawing } from "@/lib/drawing";
import { hoodAt, normRect, overlay, pipeRoute, type Plan, type Pt, type Rect } from "@/lib/plan";
import type { ApplianceKind } from "@/lib/rules";

export type Tool = "select" | "hood" | "appliance" | "duct" | "cabinet" | "pull" | "gas" | "measure";

type Grab =
  | { kind: "pan"; sx: number; sy: number; view: View }
  | { kind: "draw"; start: Pt; now: Pt }
  | { kind: "move"; target: Target; last: Pt };

export type Target = { t: "item" | "duct" | "hood"; id: string } | { t: "cabinet" | "pull" | "gas" };

/** The box that holds every hood, so the view can frame all of them. */
const hoodsBox = (plan: Plan): Rect | null => {
  if (!plan.hoods.length) return null;
  const x0 = Math.min(...plan.hoods.map((h) => h.x));
  const y0 = Math.min(...plan.hoods.map((h) => h.y));
  const x1 = Math.max(...plan.hoods.map((h) => h.x + h.w));
  const y1 = Math.max(...plan.hoods.map((h) => h.y + h.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
};

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  plan: Plan;
  design: Design;
  /** One per hood: that hood's view of the plan and its result. */
  systems: { view: Plan; result: Result }[];
  active: number;
  onActivate: (i: number) => void;
  tool: Tool;
  pendingKind: ApplianceKind;
  selected: Target | null;
  onSelect: (t: Target | null) => void;
  onPlan: (p: Plan) => void;
  onAddAppliance: (kind: ApplianceKind, r: Rect) => void;
  onAddDuct: (p: Pt) => void;
  onMeasure: (a: Pt, b: Pt) => void;
  viewRef: React.MutableRefObject<{ get: () => View; svg: () => SVGSVGElement | null; focus: (p: Pt) => void } | null>;
}

const fitView = (d: Drawing): View => {
  const b = d.bounds;
  return { x: b.minX, y: -b.maxY, w: Math.max(1, b.maxX - b.minX), h: Math.max(1, b.maxY - b.minY) };
};

const fitRect = (r: { x: number; y: number; w: number; h: number }): View => {
  const pad = Math.max(r.w, r.h) * 0.12;
  return { x: r.x - pad, y: -(r.y + r.h) - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
};

export default function PlanView(props: Props) {
  const { plan, design, systems, active, onActivate, tool, pendingKind, selected, onSelect, onPlan, onAddAppliance, onAddDuct, onMeasure, viewRef } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const flipRef = useRef<SVGGElement>(null);
  // Open on the hoods when there are any (found automatically on load), else on the whole drawing.
  const [view, setView] = useState<View>(() => {
    const b = hoodsBox(plan);
    return b ? fitRect(b) : fitView(plan.drawing);
  });
  const [grab, setGrab] = useState<Grab | null>(null);
  const [measureA, setMeasureA] = useState<Pt | null>(null);
  const [lastDrawing, setLastDrawing] = useState(plan.drawing);
  const box = hoodsBox(plan);
  const [hadHood, setHadHood] = useState(!!box);
  if (lastDrawing !== plan.drawing) {
    setLastDrawing(plan.drawing);
    setHadHood(!!box);
    setView(box ? fitRect(box) : fitView(plan.drawing));
  } else if (!hadHood && box) {
    // Hoods just appeared (found automatically or drawn): bring them into view once.
    setHadHood(true);
    if (tool !== "hood") setView(fitRect(box));
  } else if (hadHood && !box) setHadHood(false);

  const toDrawing = useCallback((cx: number, cy: number): Pt => {
    const g = flipRef.current;
    const svg = svgRef.current;
    if (!g || !svg) return { x: 0, y: 0 };
    const p = svg.createSVGPoint();
    p.x = cx;
    p.y = cy;
    const m = g.getScreenCTM();
    const q = m ? p.matrixTransform(m.inverse()) : p;
    return { x: q.x, y: q.y };
  }, []);

  useEffect(() => {
    viewRef.current = {
      get: () => view,
      svg: () => svgRef.current,
      focus: (p) => setView((v) => ({ ...v, x: p.x - v.w / 2, y: -p.y - v.h / 2 })),
    };
  }, [view, viewRef]);

  // Wheel zoom around the pointer (non-passive so the page does not scroll).
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const m = svg.getScreenCTM();
      if (!m) return;
      const p = svg.createSVGPoint();
      p.x = e.clientX;
      p.y = e.clientY;
      const q = p.matrixTransform(m.inverse());
      const f = Math.exp(e.deltaY * 0.0015);
      setView((v) => {
        const w = Math.min(v.w * f, (plan.drawing.bounds.maxX - plan.drawing.bounds.minX) * 20);
        const h = (v.h * w) / v.w;
        return { x: q.x - ((q.x - v.x) * w) / v.w, y: q.y - ((q.y - v.y) * h) / v.h, w, h };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [plan.drawing.bounds]);

  const unitPx = () => {
    const svg = svgRef.current;
    if (!svg) return 1;
    const r = svg.getBoundingClientRect();
    return Math.max(view.w / r.width, view.h / r.height);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toDrawing(e.clientX, e.clientY);
    if (e.button === 1 || tool === "select") {
      setGrab({ kind: "pan", sx: e.clientX, sy: e.clientY, view });
      if (tool === "select") onSelect(null);
      return;
    }
    if (tool === "hood" || tool === "appliance") {
      setGrab({ kind: "draw", start: p, now: p });
      return;
    }
    if (tool === "duct") return onAddDuct(p);
    if (tool === "cabinet" || tool === "pull" || tool === "gas") {
      onPlan({ ...plan, [tool]: p });
      return;
    }
    if (tool === "measure") {
      if (!measureA) setMeasureA(p);
      else {
        onMeasure(measureA, p);
        setMeasureA(null);
      }
    }
  };

  const startMove = (target: Target, e: React.PointerEvent) => {
    if (tool !== "select" || e.button !== 0) return;
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    onSelect(target);
    setGrab({ kind: "move", target, last: toDrawing(e.clientX, e.clientY) });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!grab) return;
    if (grab.kind === "pan") {
      const k = unitPx();
      setView({ ...grab.view, x: grab.view.x - (e.clientX - grab.sx) * k, y: grab.view.y - (e.clientY - grab.sy) * k });
    } else if (grab.kind === "draw") {
      setGrab({ ...grab, now: toDrawing(e.clientX, e.clientY) });
    } else {
      const p = toDrawing(e.clientX, e.clientY);
      const dx = p.x - grab.last.x;
      const dy = p.y - grab.last.y;
      const t = grab.target;
      const next: Plan = { ...plan };
      if (t.t === "item") next.items = plan.items.map((i) => (i.id === t.id ? { ...i, x: i.x + dx, y: i.y + dy } : i));
      else if (t.t === "duct") next.ducts = plan.ducts.map((d) => (d.id === t.id ? { ...d, x: d.x + dx, y: d.y + dy } : d));
      else if (t.t === "hood") {
        // A hood carries what is under it.
        const hi = plan.hoods.findIndex((h) => h.id === t.id);
        if (hi >= 0) {
          const mine = (p: Pt) => hoodAt(plan, p) === hi;
          next.hoods = plan.hoods.map((h, i) => (i === hi ? { ...h, x: h.x + dx, y: h.y + dy } : h));
          next.items = plan.items.map((i) => (mine({ x: i.x + i.w / 2, y: i.y + i.h / 2 }) ? { ...i, x: i.x + dx, y: i.y + dy } : i));
          next.ducts = plan.ducts.map((d) => (mine(d) ? { ...d, x: d.x + dx, y: d.y + dy } : d));
        }
      } else if (t.t === "cabinet" || t.t === "pull" || t.t === "gas") {
        const m = plan[t.t];
        if (m) next[t.t] = { x: m.x + dx, y: m.y + dy };
      }
      onPlan(next);
      setGrab({ ...grab, last: p });
    }
  };

  const onPointerUp = () => {
    if (grab?.kind === "draw") {
      const r = normRect(grab.start, grab.now);
      const min = unitPx() * 6;
      if (r.w > min && r.h > min) {
        if (tool === "hood") {
          onPlan({ ...plan, hoods: [...plan.hoods, { ...r, id: newId("h"), axis: r.w >= r.h ? "x" : "y", flip: false }] });
          onActivate(plan.hoods.length);
        } else onAddAppliance(pendingKind, r);
      }
    }
    setGrab(null);
  };

  const fs = view.w / 70;
  const mk = view.w / 110;
  // Every hood draws its own nozzles, detectors, pipe and detection line.
  const drawn = useMemo(() => systems.map((s) => ({ ov: overlay(s.view, s.result), route: pipeRoute(s.view) })), [systems]);
  const failed = new Set(systems.flatMap((s) => s.result.protections.filter((p) => !p.ok).map((p) => p.ref)));
  // Numbers restart under each hood, matching the plates of that hood.
  const numberOf = new Map<string, number>();
  systems.forEach((s) => s.view.items.forEach((it, n) => numberOf.set(it.id, n + 1)));
  const isSel = (t: Target) => !!selected && selected.t === t.t && ("id" in t ? "id" in selected && selected.id === t.id : true);
  const draft = grab?.kind === "draw" ? normRect(grab.start, grab.now) : null;

  return (
    <svg
      ref={svgRef}
      className={`plan tool-${tool}`}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="application"
      aria-label={`Plan of ${plan.drawing.name}. Drag to pan, scroll to zoom.`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Background drawing={plan.drawing} />

      <g ref={flipRef} transform="scale(1,-1)">
        {plan.hoods.map((h, i) => (
          <rect
            key={h.id}
            x={h.x}
            y={h.y}
            width={h.w}
            height={h.h}
            className={`p-hood${i === active && plan.hoods.length > 1 ? " is-active" : ""}${isSel({ t: "hood", id: h.id }) ? " is-sel" : ""}`}
            onPointerDown={(e) => {
              onActivate(i);
              startMove({ t: "hood", id: h.id }, e);
            }}
          />
        ))}
        {plan.items.map((it) => {
          const bad = failed.has(it.id);
          return (
            <rect
              key={it.id}
              x={it.x}
              y={it.y}
              width={it.w}
              height={it.h}
              className={`p-item${bad ? " bad" : ""}${isSel({ t: "item", id: it.id }) ? " is-sel" : ""}`}
              onPointerDown={(e) => startMove({ t: "item", id: it.id }, e)}
            />
          );
        })}
        {drawn.map(({ ov, route }, si) =>
          route ? (
            <g key={si}>
              <polyline points={route.map((p) => `${p.x},${p.y}`).join(" ")} className="p-pipe" />
              {ov.detectors.length > 0 && (
                <polyline
                  points={[route[0], route[1], route[2], ov.detectors.reduce((far, d) => (Math.hypot(d.x - route[2].x, d.y - route[2].y) > Math.hypot(far.x - route[2].x, far.y - route[2].y) ? d : far), route[2])]
                    .map((p) => `${p.x + mk * 0.5},${p.y + mk * 0.5}`)
                    .join(" ")}
                  className="p-cable"
                />
              )}
            </g>
          ) : null,
        )}
        {plan.ducts.map((d) => (
          <rect
            key={d.id}
            x={d.x - mk * 1.4}
            y={d.y - mk * 1.4}
            width={mk * 2.8}
            height={mk * 2.8}
            className={`p-duct${isSel({ t: "duct", id: d.id }) ? " is-sel" : ""}`}
            onPointerDown={(e) => startMove({ t: "duct", id: d.id }, e)}
          />
        ))}
        {drawn.flatMap(({ ov }, si) => [
          ...ov.detectors.map((d, i) => (
            <rect key={`d${si}-${i}`} x={d.x - mk * 0.45} y={d.y + mk * 0.6} width={mk * 0.9} height={mk * 0.9} className={d.terminal ? "p-det terminal" : "p-det"} />
          )),
          ...ov.nozzles.map((n, i) => <circle key={`n${si}-${i}`} cx={n.x} cy={n.y} r={mk * 0.45} className="p-nozzle" />),
        ])}
        {(["cabinet", "pull", "gas"] as const).map((k) =>
          plan[k] ? (
            <rect
              key={k}
              x={plan[k]!.x - mk}
              y={plan[k]!.y - mk}
              width={mk * 2}
              height={mk * 2}
              className={`p-marker ${k}${isSel({ t: k }) ? " is-sel" : ""}`}
              onPointerDown={(e) => startMove({ t: k }, e)}
            />
          ) : null,
        )}
        {draft && <rect x={draft.x} y={draft.y} width={draft.w} height={draft.h} className="p-draft" />}
      </g>

      {/* labels sit outside the flip so they read the right way up */}
      <g className="p-labels" style={{ fontSize: fs }}>
        {plan.hoods.map((h, i) => (
          <text key={h.id} x={h.x} y={-(h.y + h.h) - fs * 0.4} className={i === active ? "p-hood-label is-active" : "p-hood-label"}>
            {plan.hoods.length > 1 ? `Hood ${i + 1}` : "Hood"}
          </text>
        ))}
        {plan.items.map((it) => {
          const a = design.line.find((x) => x.id === it.id);
          if (!a) return null;
          return (
            <text key={it.id} x={it.x + it.w / 2} y={-(it.y + it.h / 2) + fs * 0.35} textAnchor="middle" className="p-num">
              {numberOf.get(it.id) ?? "–"}
            </text>
          );
        })}
        {drawn.flatMap(({ ov }, si) =>
          ov.nozzles
            .filter((n) => n.zone === "appliance")
            .map((n, i) => (
              <text key={`c${si}-${i}`} x={n.x + mk * 0.7} y={-n.y - mk * 0.5} className="p-code">
                {n.code}
              </text>
            )),
        )}
        {(["cabinet", "pull", "gas"] as const).map((k) =>
          plan[k] ? (
            <text key={k} x={plan[k]!.x} y={-plan[k]!.y + fs * 0.35} textAnchor="middle" className="p-mark-label">
              {k === "cabinet" ? "T" : k === "pull" ? "P" : "G"}
            </text>
          ) : null,
        )}
        {measureA && <circle cx={measureA.x} cy={-measureA.y} r={mk * 0.5} className="p-measure" />}
      </g>
    </svg>
  );
}

/** The uploaded drawing itself; memoised because its paths can be megabytes long. */
const Background = memo(function Background({ drawing }: { drawing: Drawing }) {
  return (
    <g className="p-bg" aria-hidden="true">
      {drawing.image && <image href={drawing.image.href} x={0} y={-drawing.image.height} width={drawing.image.width} height={drawing.image.height} />}
      {drawing.layers.length > 0 && (
        <g transform="scale(1,-1)">
          {drawing.layers.map((l) => (
            <path key={l.name} d={l.d} />
          ))}
        </g>
      )}
      {drawing.source !== "pdf" && drawing.texts.length <= 4000 && (
        <g className="p-bg-text">
          {drawing.texts.map((t, i) => (
            <text key={i} x={t.x} y={-t.y} fontSize={t.h}>
              {t.value}
            </text>
          ))}
        </g>
      )}
    </g>
  );
});

export const TOOL_LABEL: Record<Tool, string> = {
  select: "Move",
  hood: "Draw hood",
  appliance: "Draw appliance",
  duct: "Place duct",
  cabinet: "Place tank",
  pull: "Place pull station",
  gas: "Place gas valve",
  measure: "Set scale",
};

export const kindLabel = (k: ApplianceKind) => KIND_LABEL[k];
