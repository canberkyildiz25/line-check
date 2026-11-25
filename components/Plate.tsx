"use client";

import { forwardRef } from "react";
import { KIND_LABEL, defaultAppliance, type Appliance, type Protection } from "@/lib/engine";
import type { ApplianceKind } from "@/lib/rules";
import { span, type Unit } from "@/lib/units";
import { Check, Length, Select } from "./Fields";

const KINDS = Object.keys(KIND_LABEL) as ApplianceKind[];

interface Props {
  index: number;
  count: number;
  appliance: Appliance;
  protection?: Protection;
  unit: Unit;
  selected: boolean;
  onSelect: () => void;
  onChange: (a: Appliance) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
  /** Placed on an uploaded plan: width and position come from there. */
  placed?: boolean;
}

/** One appliance on the line, styled as an equipment nameplate. */
const Plate = forwardRef<HTMLElement, Props>(function Plate(
  { index, count, appliance: a, protection: p, unit, selected, onSelect, onChange, onRemove, onMove, placed },
  ref,
) {
  const set = (patch: Partial<Appliance>) => onChange({ ...a, ...patch });
  const isFryer = a.kind === "fryer";
  const surfaceLabels: Record<string, [string, string]> = {
    fryer: [a.dripboard ? "Whole vat, side to side" : "Fry pot, side to side", a.dripboard ? "Whole vat, front to back" : "Fry pot, front to back"],
    salamander: ["Chamber, side to side", "Chamber, front to back"],
    wok: ["Hazard, side to side", "Hazard, front to back"],
  };
  const [sl, sd] = surfaceLabels[a.kind] ?? ["Surface, side to side", "Surface, front to back"];

  return (
    <article
      ref={ref}
      className={`plate${selected ? " is-selected" : ""}${p && !p.ok ? " is-bad" : ""}`}
      onFocus={onSelect}
      onPointerDown={onSelect}
      aria-label={`Appliance ${index + 1}`}
    >
      <header className="plate-head">
        <span className="plate-no" aria-hidden="true">
          {index + 1}
        </span>
        <div className="plate-kind">
          <Select
            label="Appliance"
            value={a.kind}
            options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            onChange={(k) => onChange({ ...defaultAppliance(k, a.id) })}
          />
        </div>
        <div className="plate-tools">
          <button type="button" className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move left">
            <Arrow dir="left" />
          </button>
          <button type="button" className="icon-btn" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move right">
            <Arrow dir="right" />
          </button>
          <button type="button" className="icon-btn" onClick={onRemove} disabled={count === 1} aria-label={`Remove appliance ${index + 1}`}>
            <Cross />
          </button>
        </div>
      </header>

      <div className="plate-grid">
        {placed ? (
          <div className="field">
            <span className="field-static-label">Overall width</span>
            <p className="field-static">{Math.round(unit === "in" ? a.width : a.width * 2.54)} {unit === "in" ? "in." : "cm"}, from the plan</p>
          </div>
        ) : (
          <Length label="Overall width" value={a.width} unit={unit} min={6} max={96} onChange={(v) => set({ width: v })} />
        )}
        <Length label="Nozzle tip height" value={a.tipHeight} unit={unit} min={1} max={60} onChange={(v) => set({ tipHeight: v })} />
        {a.kind === "wok" ? (
          <>
            <Length label="Wok diameter" value={a.wokDiameter ?? 20} unit={unit} min={6} max={40} onChange={(v) => set({ wokDiameter: v, surfaceLength: v, surfaceDepth: v })} />
            <Length label="Wok depth" value={a.wokDepth ?? 5} unit={unit} min={1} max={12} onChange={(v) => set({ wokDepth: v })} />
          </>
        ) : (
          <>
            <Length label={sl} value={a.surfaceLength} unit={unit} min={4} max={96} onChange={(v) => set({ surfaceLength: v })} />
            <Length label={sd} value={a.surfaceDepth} unit={unit} min={4} max={60} onChange={(v) => set({ surfaceDepth: v })} />
          </>
        )}
        {isFryer && a.dripboard && (
          <>
            <Length label="Pot alone, side to side" value={a.potLength ?? a.surfaceLength} unit={unit} min={4} max={60} onChange={(v) => set({ potLength: v })} />
            <Length label="Pot alone, front to back" value={a.potDepth ?? a.surfaceDepth} unit={unit} min={4} max={60} onChange={(v) => set({ potDepth: v })} />
          </>
        )}
        {(a.kind === "charbroiler-charcoal" || a.kind === "charbroiler-wood") && (
          <Length label={a.kind === "charbroiler-wood" ? "Wood depth" : "Charcoal depth"} value={a.fuelDepth ?? 3} unit={unit} min={0} max={12} onChange={(v) => set({ fuelDepth: v })} />
        )}
      </div>

      {isFryer && (
        <div className="plate-checks">
          <Check label="Has a dripboard" checked={!!a.dripboard} onChange={(v) => set({ dripboard: v })} />
          <Check label="Split vat" checked={!!a.splitVat} onChange={(v) => set({ splitVat: v })} />
        </div>
      )}

      {p && (
        <footer className="plate-result" aria-live="polite">
          {p.ok ? (
            <>
              <p className="plate-verdict">
                <span className="code">{p.summary}</span>
                <span className="flow">{fmtFlow(p.flow)}</span>
              </p>
              {p.alternatives && p.alternatives.length > 0 && (
                <p className="plate-alt">
                  Fewer flow numbers at another height:{" "}
                  {p.alternatives.map((alt, i) => (
                    <span key={alt.label}>
                      {i > 0 && ", "}
                      <button type="button" className="link" onClick={() => set({ tipHeight: mid(alt.height) })}>
                        {alt.label.replace(/ at .*/, "")} at {span(alt.height, unit)}
                      </button>
                    </span>
                  ))}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="plate-verdict bad">
                <span className="code">{p.summary}</span>
              </p>
              <p className="plate-why">{p.reason}</p>
              {p.alternatives && p.alternatives.length > 0 && (
                <p className="plate-alt">
                  Move the tip:{" "}
                  {p.alternatives.map((alt, i) => (
                    <span key={alt.label}>
                      {i > 0 && ", "}
                      <button type="button" className="link" onClick={() => set({ tipHeight: mid(alt.height) })}>
                        {alt.label.replace(/ at .*/, "")} at {span(alt.height, unit)}
                      </button>
                    </span>
                  ))}
                </p>
              )}
            </>
          )}
        </footer>
      )}
    </article>
  );
});

export default Plate;

const mid = (h: [number, number]) => Math.round(((h[0] + h[1]) / 2) * 2) / 2;
export const fmtFlow = (f: number) => `${Number.isInteger(f) ? f : f.toFixed(1)} flow`;

function Arrow({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d={dir === "left" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}

function Cross() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="square" />
    </svg>
  );
}
