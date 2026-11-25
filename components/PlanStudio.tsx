"use client";

import { useRef, useState } from "react";
import { KIND_LABEL, newId, type Design, type Result } from "@/lib/engine";
import { UNITS } from "@/lib/drawing";
import { hoodAt, itemSpan, type Plan, type Pt, type Rect } from "@/lib/plan";
import type { ApplianceKind } from "@/lib/rules";
import PlanView, { TOOL_LABEL, type Target, type Tool } from "./PlanView";

interface Props {
  plan: Plan;
  design: Design;
  /** One per hood: the hood's own view of the plan and its result. */
  systems: { view: Plan; result: Result }[];
  active: number;
  onActivate: (i: number) => void;
  onPlan: (p: Plan) => void;
  onAddAppliance: (kind: ApplianceKind, r: Rect) => void;
  onAddDuct: (p: Pt) => void;
  onRemove: (t: Target) => void;
  onClose: () => void;
  onExport: () => void;
  notice: string | null;
  onDetect: () => void;
  /** Multi-page PDFs: open another page. */
  onPage?: (page: number) => void;
}

const KINDS = Object.keys(KIND_LABEL) as ApplianceKind[];
const TOOLS: Tool[] = ["select", "hood", "appliance", "duct", "cabinet", "pull", "gas", "measure"];

export default function PlanStudio({ plan, design, systems, active, onActivate, onPlan, onAddAppliance, onAddDuct, onRemove, onClose, onExport, notice, onDetect, onPage }: Props) {
  const [tool, setTool] = useState<Tool>(plan.hoods.length ? "select" : "hood");
  const hasHood = plan.hoods.length > 0;
  const [kind, setKind] = useState<ApplianceKind>("fryer");
  const [selected, setSelected] = useState<Target | null>(null);
  const [measure, setMeasure] = useState<{ a: Pt; b: Pt } | null>(null);
  const [measureText, setMeasureText] = useState("");
  const [measureUnit, setMeasureUnit] = useState("millimetres");
  const [ai, setAi] = useState<{ state: "idle" | "consent" | "busy" | "done" | "error"; message?: string }>({ state: "idle" });
  const viewRef = useRef<{ get: () => { x: number; y: number; w: number; h: number }; svg: () => SVGSVGElement | null; focus: (p: Pt) => void } | null>(null);
  const d = plan.drawing;

  const unitLabel = UNITS.find((u) => Math.abs(u.inchesPerUnit - plan.inchesPerUnit) / u.inchesPerUnit < 0.01)?.label;

  const askAi = async () => {
    const v = viewRef.current?.get();
    const svg = viewRef.current?.svg();
    if (!v || !svg) return;
    setAi({ state: "busy" });
    try {
      const image = await snapshot(svg, v);
      const texts = d.texts.filter((t) => t.x >= v.x && t.x <= v.x + v.w && -t.y >= v.y && -t.y <= v.y + v.h).map((t) => t.value).slice(0, 300);
      const res = await fetch("/api/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image, texts }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "The suggestion failed.");
      const fx = (f: number) => v.x + Math.min(1, Math.max(0, f)) * v.w;
      const fy = (f: number) => -(v.y + Math.min(1, Math.max(0, f)) * v.h);
      const box = (b: { x0: number; y0: number; x1: number; y1: number }): Rect => ({ x: Math.min(fx(b.x0), fx(b.x1)), y: Math.min(fy(b.y0), fy(b.y1)), w: Math.abs(fx(b.x1) - fx(b.x0)), h: Math.abs(fy(b.y1) - fy(b.y0)) });
      // A suggested hood is added unless one already covers that spot.
      const newHood = json.hood ? box(json.hood) : null;
      const addHood = !!newHood && hoodAt(plan, { x: newHood.x + newHood.w / 2, y: newHood.y + newHood.h / 2 }) < 0;
      if (newHood && addHood) {
        onPlan({ ...plan, hoods: [...plan.hoods, { ...newHood, id: newId("h"), axis: newHood.w >= newHood.h ? "x" : "y", flip: false }] });
        onActivate(plan.hoods.length);
      }
      let added = 0;
      for (const a of json.appliances ?? []) {
        if (a.confidence === "low") continue;
        onAddAppliance(a.kind as ApplianceKind, box(a));
        added++;
      }
      for (const p of json.ducts ?? []) onAddDuct({ x: fx(p.x), y: fy(p.y) });
      setAi({
        state: "done",
        message: `Suggested ${addHood ? "a hood, " : ""}${added} appliance${added === 1 ? "" : "s"} and ${(json.ducts ?? []).length} duct${(json.ducts ?? []).length === 1 ? "" : "s"}. Check each one: move, delete or change its kind.${json.notes ? ` ${json.notes}` : ""}`,
      });
    } catch (e) {
      setAi({ state: "error", message: e instanceof Error ? e.message : "The suggestion failed." });
    }
  };

  const applyMeasure = () => {
    if (!measure) return;
    const n = Number(measureText.replace(",", "."));
    const unit = UNITS.find((u) => u.label === measureUnit);
    const dist = Math.hypot(measure.b.x - measure.a.x, measure.b.y - measure.a.y);
    if (!unit || !(n > 0) || !(dist > 0)) return;
    onPlan({ ...plan, inchesPerUnit: (n * unit.inchesPerUnit) / dist, unitsConfirmed: true });
    setMeasure(null);
    setMeasureText("");
    setTool("select");
  };

  const status = !plan.unitsConfirmed
    ? "Confirm the drawing's units first, or set the scale from two points."
    : !hasHood
      ? "Draw the hood: drag a box over the canopy outline. Draw one box per hood; each is its own system."
      : plan.items.length === 0
        ? "Draw each appliance under its hood, left to right."
        : !plan.cabinet
          ? "Place the tank, the pull station and the gas valve to measure the runs."
          : "Drag anything to move it. Select it and press Delete to remove it.";

  return (
    <section className="studio" aria-labelledby="studio-title">
      <div className="studio-head">
        <div>
          <h2 id="studio-title">{d.name}</h2>
          <p className="studio-meta">
            {d.source.toUpperCase()} · {d.stats.entities.toLocaleString("en")} objects read{unitLabel ? ` · ${unitLabel}` : ""} · read in your browser, not uploaded
          </p>
          {d.page && d.page.count > 1 && onPage && (
            <label className="studio-page">
              Page{" "}
              <select className="tool-select" value={d.page.index} onChange={(e) => onPage(Number(e.target.value))}>
                {Array.from({ length: d.page.count }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>{" "}
              of {d.page.count}
            </label>
          )}
        </div>
        <div className="studio-actions">
          <button type="button" className="btn" onClick={onDetect}>
            Find automatically
          </button>
          <button type="button" className="btn" onClick={onExport} disabled={!hasHood}>
            Download DXF
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close drawing
          </button>
        </div>
      </div>

      {notice && (
        <p className="studio-notice" role="status">
          {notice}
        </p>
      )}

      <div className="toolbar" role="toolbar" aria-label="Plan tools">
        {TOOLS.map((t) => (
          <button
            key={t}
            type="button"
            className="tool"
            aria-pressed={tool === t}
            disabled={t === "appliance" && !hasHood}
            onClick={() => {
              setTool(t);
              setMeasure(null);
            }}
          >
            {TOOL_LABEL[t]}
          </button>
        ))}
        {tool === "appliance" && (
          <select className="tool-select" aria-label="Appliance to draw" value={kind} onChange={(e) => setKind(e.target.value as ApplianceKind)}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        )}
        {selected && (
          <button
            type="button"
            className="tool danger"
            onClick={() => {
              onRemove(selected);
              setSelected(null);
            }}
          >
            Remove selected
          </button>
        )}
      </div>

      <div className="studio-body">
        <div
          className="plan-wrap"
          tabIndex={-1}
          onKeyDown={(e) => {
            if ((e.key === "Delete" || e.key === "Backspace") && selected) {
              onRemove(selected);
              setSelected(null);
            }
          }}
        >
          <PlanView
            plan={plan}
            design={design}
            systems={systems}
            active={active}
            onActivate={onActivate}
            tool={tool}
            pendingKind={kind}
            selected={selected}
            onSelect={setSelected}
            onPlan={onPlan}
            onAddAppliance={onAddAppliance}
            onAddDuct={(p) => {
              onAddDuct(p);
              setTool("select");
            }}
            onMeasure={(a, b) => setMeasure({ a, b })}
            viewRef={viewRef}
          />
          <p className="plan-status" aria-live="polite">
            {status}
          </p>
        </div>

        <aside className="studio-side">
          {!plan.unitsConfirmed && (
            <div className="side-block">
              <h3>Units</h3>
              <p className="side-text">
                {d.unitGuess
                  ? d.unitGuess.note ?? `The file does not say. From its size it looks like ${d.unitGuess.label}.`
                  : "A PDF or picture has no units. Set the scale from a dimension you can read on it."}
              </p>
              {d.unitGuess && d.paperInchesPerUnit && (
                <div className="side-row">
                  <select
                    className="tool-select"
                    aria-label="Drawing scale"
                    value={String(Math.round(plan.inchesPerUnit / d.paperInchesPerUnit))}
                    onChange={(e) => onPlan({ ...plan, inchesPerUnit: d.paperInchesPerUnit! * Number(e.target.value) })}
                  >
                    {[10, 20, 25, 30, 50, 75, 100, 200].map((s) => (
                      <option key={s} value={s}>
                        1:{s}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn primary" onClick={() => onPlan({ ...plan, unitsConfirmed: true })}>
                    Confirm
                  </button>
                </div>
              )}
              {d.unitGuess && !d.paperInchesPerUnit && (
                <div className="side-row">
                  <select
                    className="tool-select"
                    aria-label="Drawing units"
                    value={unitLabel ?? d.unitGuess.label}
                    onChange={(e) => onPlan({ ...plan, inchesPerUnit: UNITS.find((u) => u.label === e.target.value)!.inchesPerUnit })}
                  >
                    {UNITS.map((u) => (
                      <option key={u.label} value={u.label}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn primary" onClick={() => onPlan({ ...plan, unitsConfirmed: true })}>
                    Confirm
                  </button>
                </div>
              )}
              <button type="button" className="link" onClick={() => setTool("measure")}>
                Set the scale from two points
              </button>
            </div>
          )}

          {measure && (
            <div className="side-block">
              <h3>Scale</h3>
              <p className="side-text">How long is the line between the two points you clicked?</p>
              <div className="side-row">
                <input className="side-input" inputMode="decimal" aria-label="Real length" value={measureText} onChange={(e) => setMeasureText(e.target.value)} />
                <select className="tool-select" aria-label="Unit of that length" value={measureUnit} onChange={(e) => setMeasureUnit(e.target.value)}>
                  {UNITS.map((u) => (
                    <option key={u.label} value={u.label}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="btn primary" onClick={applyMeasure}>
                Set scale
              </button>
            </div>
          )}

          <div className="side-block">
            <h3>Suggest from the drawing</h3>
            <p className="side-text">
              Zoom to the kitchen first. An AI model looks at the view and proposes the hood, appliances and ducts; nothing counts until you check it.
            </p>
            {ai.state === "consent" ? (
              <>
                <p className="side-text warn">
                  This sends a picture of the current view, and the text in it, to Anthropic&rsquo;s API. Do not use it on a drawing you may not share.
                </p>
                <div className="side-row">
                  <button type="button" className="btn primary" onClick={askAi}>
                    Send and suggest
                  </button>
                  <button type="button" className="btn" onClick={() => setAi({ state: "idle" })}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <button type="button" className="btn" disabled={ai.state === "busy" || !plan.unitsConfirmed} onClick={() => setAi({ state: "consent" })}>
                {ai.state === "busy" ? "Reading the view…" : "Suggest with AI"}
              </button>
            )}
            {ai.message && <p className={ai.state === "error" ? "side-text error" : "side-text"}>{ai.message}</p>}
          </div>

          {d.hints.length > 0 && (
            <div className="side-block">
              <h3>Found in the drawing</h3>
              <ul className="hints">
                {d.hints.slice(0, 14).map((h, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className="hint"
                      onClick={() => {
                        viewRef.current?.focus({ x: h.x, y: h.y });
                        if (h.kind === "hood") setTool("hood");
                        else if (hasHood) {
                          setKind(h.kind);
                          setTool("appliance");
                        }
                      }}
                    >
                      <span className="hint-kind">{h.label}</span>
                      <span className="hint-text">{h.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {hasHood && plan.items.length > 0 && (
            <div className="side-block">
              <h3>Placed</h3>
              {systems.map((s, si) => (
                <div key={si} className="placed-group">
                  {systems.length > 1 && (
                    <button type="button" className={si === active ? "link placed-hood is-active" : "link placed-hood"} onClick={() => onActivate(si)}>
                      Hood {si + 1} · {s.result.flow.total} flow
                    </button>
                  )}
                  <ul className="placed">
                    {s.view.items.map((it, n) => {
                      const a = design.line.find((x) => x.id === it.id);
                      if (!a) return null;
                      const span = itemSpan(s.view.hood!, it);
                      return (
                        <li key={it.id}>
                          {n + 1}. {KIND_LABEL[a.kind]} · {Math.round(span.length * plan.inchesPerUnit)} in. wide
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}

/** A picture of the drawing as it is on screen, without the overlay, for the AI suggestion. */
async function snapshot(svg: SVGSVGElement, v: { x: number; y: number; w: number; h: number }): Promise<string> {
  const W = 1600;
  const H = Math.round((W * v.h) / v.w);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  [...clone.children].forEach((c) => {
    if (!c.classList.contains("p-bg")) c.remove();
  });
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(W));
  clone.setAttribute("height", String(H));
  clone.querySelectorAll("path").forEach((p) => {
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "#222");
    p.setAttribute("stroke-width", "1.2");
    p.setAttribute("vector-effect", "non-scaling-stroke");
  });
  clone.querySelectorAll("text").forEach((t) => t.setAttribute("fill", "#222"));
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
