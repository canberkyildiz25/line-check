"use client";

import { KIND_LABEL, type Design, type Result } from "@/lib/engine";
import { run, len, type Unit } from "@/lib/units";

const BODY = 34; // appliance body below the cooking surface, in.
const HOOD_H = 28; // drawn height of the hood box
const DUCT_H = 20;

interface Props {
  design: Design;
  result: Result;
  unit: Unit;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Bumped to replay the discharge sequence. */
  firing?: number;
}

/** Front elevation of the hood and line, drawn to scale in inches. */
export default function Elevation({ design, result, unit, selected, onSelect, firing = 0 }: Props) {
  const { hood } = design;
  const W = hood.length;
  const C = hood.clearance;
  const hoodTop = C + HOOD_H;
  const top = hoodTop + DUCT_H + 4;
  const xMin = -40;
  const xMax = Math.max(W, ...Object.values(result.applianceX).map((s) => s.end)) + 10;
  const yMin = -BODY - 16;
  const Y = (y: number) => top - y;
  const fs = Math.max(2.4, (xMax - xMin) / 62);
  const pipeY = hoodTop - 3;
  const cableY = hoodTop - 6.5;

  const failed = new Set(result.protections.filter((p) => !p.ok).map((p) => p.ref));
  const lastDetector = result.detectors.reduce((m, d) => Math.max(m, d.x), 0);

  const label = `Front elevation: ${run(W, unit)} hood, ${design.ducts.length} duct${design.ducts.length === 1 ? "" : "s"}, ${design.line.length} appliances, ${result.nozzles.length} nozzles, ${result.detectors.length} detectors.`;

  return (
    <svg
      key={firing}
      className={`elevation${firing ? " is-firing" : ""}`}
      viewBox={`${xMin} 0 ${xMax - xMin} ${top - yMin}`}
      role="img"
      aria-label={label}
      style={{ ["--fs" as string]: `${fs}px` }}
    >
      <defs>
        <pattern id="filter" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="3" className="hatch" />
        </pattern>
        <pattern id="floor" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="4" className="hatch" />
        </pattern>
      </defs>

      {/* floor */}
      <rect x={xMin} y={Y(-BODY)} width={xMax - xMin} height={2.4} fill="url(#floor)" />
      <line x1={xMin} x2={xMax} y1={Y(-BODY)} y2={Y(-BODY)} className="ink thin" />

      {/* tank cabinet on the wall, labels below it */}
      <g>
        <rect x={-34} y={Y(C + 10)} width={20} height={30} className="cabinet" />
        <text x={-24} y={Y(C - 20) + fs * 1.1} className="t-small" textAnchor="middle">
          {result.system ? `${result.system.gallons} gal` : "—"}
        </text>
        <text x={-24} y={Y(C - 20) + fs * 2.3} className="t-small muted" textAnchor="middle">
          {result.system ? `${result.system.tanks} tank${result.system.tanks > 1 ? "s" : ""}` : "size it"}
        </text>
      </g>

      {/* ducts */}
      {design.ducts.map((d, i) => {
        const w = d.shape === "round" ? d.diameter : d.sideB;
        const bad = failed.has(d.id);
        return (
          <g key={d.id}>
            <rect x={d.position - w / 2} y={Y(hoodTop + DUCT_H)} width={w} height={DUCT_H} className={bad ? "duct bad" : "duct"} />
            <text x={d.position} y={Y(hoodTop + DUCT_H) - fs * 0.5} className="t-small" textAnchor="middle">
              {`Duct ${i + 1} · ${d.shape === "round" ? `Ø${len(d.diameter, unit)}` : `${len(d.sideA, unit)} × ${len(d.sideB, unit)}`}`}
            </text>
          </g>
        );
      })}

      {/* hood */}
      <rect x={0} y={Y(hoodTop)} width={W} height={HOOD_H} className="hood" />
      <rect x={2} y={Y(C + 12)} width={W - 4} height={9} fill="url(#filter)" className="filters" />
      <text x={3} y={Y(C + 12) - fs * 0.35} className="t-small muted">
        {hood.filterBank === "v-bank" ? "V-bank filters" : "Single-bank filters"}
      </text>

      {/* agent supply: cabinet up into the hood and along it */}
      <path d={`M ${-24} ${Y(C + 10)} V ${Y(pipeY)} H ${W - 3}`} className="agent main" pathLength={1} />

      {/* detection cable */}
      {result.detectors.length > 0 && (
        <path d={`M ${-14} ${Y(C + 4)} H ${-6} V ${Y(cableY)} H ${lastDetector}`} className="cable" />
      )}
      {result.detectors.map((d, i) => (
        <rect
          key={`${d.ref}-${i}`}
          x={d.x - 1.6}
          y={Y(cableY) - 1.6}
          width={3.2}
          height={3.2}
          className={i === result.detectors.length - 1 ? "detector terminal" : "detector"}
        >
          <title>{`${i === result.detectors.length - 1 ? "Terminal" : "Series"} detector · ${d.reason}`}</title>
        </rect>
      ))}

      {/* appliances, their cones and nozzles */}
      {design.line.map((a, i) => {
        const span = result.applianceX[a.id];
        if (!span) return null;
        const cx = (span.start + span.end) / 2;
        const half = Math.min(a.surfaceLength, span.end - span.start) / 2;
        const isSel = selected === a.id;
        const bad = failed.has(a.id);
        const mine = result.nozzles.filter((n) => n.ref === a.id);
        const seg = (half * 2) / Math.max(1, mine.length);
        return (
          <g
            key={a.id}
            className={`appliance${isSel ? " is-selected" : ""}${bad ? " bad" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={isSel}
            aria-label={`${i + 1}. ${KIND_LABEL[a.kind]}${bad ? ", not covered" : ""}`}
            onClick={() => onSelect(a.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(a.id);
              }
            }}
          >
            {mine.map((n, k) => {
              const l = cx - half + seg * k;
              const r = l + seg;
              const tip = Math.min(n.tip ?? 30, C + HOOD_H - 6);
              return (
                <g key={k}>
                  <polygon points={`${n.x},${Y(tip)} ${l},${Y(0)} ${r},${Y(0)}`} className="cone" />
                  <line x1={n.x} x2={n.x} y1={Y(pipeY)} y2={Y(tip)} className="agent drop" />
                  <path d={`M ${n.x - 1.4} ${Y(tip) - 1.6} H ${n.x + 1.4} L ${n.x} ${Y(tip) + 0.8} Z`} className="nozzle" />
                  <path d={`M ${(l + r) / 2 - 4} ${Y(0)} q 1.2 -7 4 -10 q 2.8 3 4 10 z`} className="flame" />
                  <rect x={l + 1} y={Y(0) - 2.2} width={Math.max(1, r - l - 2)} height={2.2} rx={1.1} className="foam" />
                  {k === 0 && (
                    <text x={n.x + 2} y={Y(tip) - 1.2} className="t-code">
                      {mine.length > 1 ? `${mine.length}×${n.code}` : n.code}
                    </text>
                  )}
                </g>
              );
            })}
            <rect x={span.start + 0.6} y={Y(0)} width={span.end - span.start - 1.2} height={BODY} className="body" />
            <line x1={cx - half} x2={cx + half} y1={Y(0)} y2={Y(0)} className="surface" />
            <KindMark kind={a.kind} cx={cx} half={half} Y={Y} />
            <text x={cx} y={Y(-BODY / 2) - fs * 0.2} className="t-plate" textAnchor="middle">
              {i + 1}
            </text>
            <text x={cx} y={Y(-BODY / 2) + fs * 1.3} className="t-small" textAnchor="middle">
              {shortKind(a.kind)}
            </text>
            {bad && (
              <text x={cx} y={Y(-BODY / 2) + fs * 2.8} className="t-small t-bad" textAnchor="middle">
                not covered
              </text>
            )}
          </g>
        );
      })}

      {/* plenum and duct nozzles */}
      {result.nozzles
        .filter((n) => n.zone !== "appliance")
        .map((n, i) => {
          const y = n.zone === "duct" ? hoodTop + 5 : C + 18;
          return (
            <g key={`${n.ref}-${i}`}>
              <line x1={n.x} x2={n.x} y1={Y(pipeY)} y2={Y(y)} className="agent drop" />
              <circle cx={n.x} cy={Y(y)} r={1.1} className="nozzle" />
            </g>
          );
        })}

      {/* dimensions */}
      <g className="dim">
        <line x1={0} x2={W} y1={Y(-BODY - 9)} y2={Y(-BODY - 9)} />
        <line x1={0} x2={0} y1={Y(-BODY - 6)} y2={Y(-BODY - 12)} />
        <line x1={W} x2={W} y1={Y(-BODY - 6)} y2={Y(-BODY - 12)} />
        <text x={W / 2} y={Y(-BODY - 9) - fs * 0.45} textAnchor="middle" className="t-small">
          {`Hood ${run(W, unit)}`}
        </text>
        <line x1={W + 5} x2={W + 5} y1={Y(0)} y2={Y(C)} />
        <line x1={W + 3} x2={W + 7} y1={Y(0)} y2={Y(0)} />
        <line x1={W + 3} x2={W + 7} y1={Y(C)} y2={Y(C)} />
        <text x={W + 6.5} y={Y(C / 2)} className="t-small" transform={`rotate(-90 ${W + 6.5} ${Y(C / 2)})`} textAnchor="middle">
          {len(C, unit)}
        </text>
      </g>
    </svg>
  );
}

function shortKind(k: Design["line"][number]["kind"]) {
  return (
    {
      fryer: "Fryer",
      "tilt-skillet": "Skillet",
      range: "Range",
      griddle: "Griddle",
      "charbroiler-gas": "Broiler",
      "charbroiler-lava": "Lava rock",
      "charbroiler-charcoal": "Charcoal",
      "charbroiler-wood": "Wood",
      wok: "Wok",
      salamander: "Salamander",
    } as const
  )[k];
}

/** A small mark on the cooking surface so the line reads at a glance. */
function KindMark({ kind, cx, half, Y }: { kind: Design["line"][number]["kind"]; cx: number; half: number; Y: (y: number) => number }) {
  switch (kind) {
    case "fryer":
    case "tilt-skillet":
      return <path d={`M ${cx - half + 1} ${Y(0)} V ${Y(-7)} H ${cx + half - 1} V ${Y(0)}`} className="mark" />;
    case "range": {
      const n = Math.max(2, Math.round((half * 2) / 12));
      return (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const x = cx - half + ((half * 2) / n) * (i + 0.5);
            return <line key={i} x1={x - 3} x2={x + 3} y1={Y(1.2)} y2={Y(1.2)} className="mark" />;
          })}
        </g>
      );
    }
    case "wok":
      return <path d={`M ${cx - half * 0.8} ${Y(0.5)} Q ${cx} ${Y(-9)} ${cx + half * 0.8} ${Y(0.5)}`} className="mark" />;
    case "salamander":
      return <rect x={cx - half} y={Y(16)} width={half * 2} height={12} className="mark box" />;
    case "griddle":
      return <line x1={cx - half} x2={cx + half} y1={Y(1)} y2={Y(1)} className="mark" />;
    default: {
      const n = Math.max(3, Math.round((half * 2) / 4));
      return (
        <g>
          {Array.from({ length: n }, (_, i) => {
            const x = cx - half + ((half * 2) / n) * (i + 0.5);
            return <line key={i} x1={x} x2={x} y1={Y(0)} y2={Y(-3)} className="mark" />;
          })}
        </g>
      );
    }
  }
}
