"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { KIND_LABEL, defaultAppliance, newId, solve, type Design, type Duct } from "@/lib/engine";
import { autoDetect } from "@/lib/detect";
import { designToDxf, download } from "@/lib/export";
import { loadFile } from "@/lib/load";
import { applyPlan, emptyPlan, hoodAt, itemSpan, viewOf, type Hood, type Plan, type Pt, type Rect } from "@/lib/plan";
import { PRESETS, START } from "@/lib/presets";
import { DETECTOR_STYLES, GAS_VALVES, type ApplianceKind, type DetectorStyle, type GasValveType } from "@/lib/rules";
import { decode, encode } from "@/lib/share";
import { fToC, run, type Unit } from "@/lib/units";
import Elevation from "./Elevation";
import { Length, Select } from "./Fields";
import Covers from "./Covers";
import Hero from "./Hero";
import PlanStudio from "./PlanStudio";
import Plate from "./Plate";
import Results from "./Results";
import Sheet from "./Sheet";

const KINDS = Object.keys(KIND_LABEL) as ApplianceKind[];
type Target = { t: "item" | "duct" | "hood"; id: string } | { t: "cabinet" | "pull" | "gas" };

export default function Workbench() {
  const [design, setDesign] = useState<Design>(START);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [unit, setUnit] = useState<Unit>("in");
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<"link" | "text" | null>(null);
  const [adding, setAdding] = useState<ApplianceKind>("range");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firing, setFiring] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const loaded = useRef(false);
  const plates = useRef<Record<string, HTMLElement | null>>({});
  const studioRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);

  const [active, setActive] = useState(0);

  // One system per hood: the appliances and ducts under it, with the shared settings.
  const systems = useMemo(() => {
    if (!plan || !plan.hoods.length) return [{ view: null as Plan | null, effective: design, result: solve(design) }];
    return plan.hoods.map((_, i) => {
      const view = viewOf(plan, i);
      const ids = new Set(view.items.map((x) => x.id));
      const dids = new Set(view.ducts.map((x) => x.id));
      const part: Design = {
        ...design,
        name: plan.hoods.length > 1 ? `${design.name} · hood ${i + 1}` : design.name,
        line: design.line.filter((a) => ids.has(a.id)),
        ducts: design.ducts.filter((d) => dids.has(d.id)),
      };
      const effective = applyPlan(part, view);
      return { view: view as Plan | null, effective, result: solve(effective) };
    });
  }, [design, plan]);
  const current = Math.min(active, systems.length - 1);
  const { effective, result } = systems[current];
  // Appliances drawn on the plan but outside every hood belong to no system yet.
  const loose =
    plan && plan.hoods.length
      ? design.line.filter((a) => {
          const it = plan.items.find((i) => i.id === a.id);
          return it && hoodAt(plan, { x: it.x + it.w / 2, y: it.y + it.h / 2 }) < 0;
        })
      : [];

  // Open a shared line from the address and restore the unit: a one-time read of
  // state that lives outside React, after hydration so the server HTML still matches.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const m = window.location.hash.match(/d=([^&]+)/);
    const shared = m ? decode(m[1]) : null;
    if (shared) setDesign(shared);
    try {
      const u = localStorage.getItem("line-check:unit");
      if (u === "cm" || u === "in") setUnit(u);
    } catch {}
    /* eslint-enable react-hooks/set-state-in-effect */
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const t = window.setTimeout(() => window.history.replaceState(null, "", `#d=${encode(effective)}`), 250);
    return () => window.clearTimeout(t);
  }, [effective]);

  useEffect(() => {
    try {
      localStorage.setItem("line-check:unit", unit);
    } catch {}
  }, [unit]);

  const lastFile = useRef<File | null>(null);
  const openFile = async (file: File, page?: number) => {
    setLoading(true);
    setLoadError(null);
    lastFile.current = file;
    try {
      const drawing = await loadFile(file, page);
      setDesign((d) => ({ ...d, name: file.name.replace(/\.[^.]+$/, ""), line: [], ducts: [], site: undefined }));
      setSelected(null);
      detect(emptyPlan(drawing));
      window.setTimeout(() => studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "That file could not be read.");
    } finally {
      setLoading(false);
    }
  };

  /** Find the hood, appliances and ducts in a vector plan and place them, replacing what was there. */
  const detect = (base: Plan) => {
    if (!base.drawing.shapes.length) {
      setPlan(base);
      setNotice(
        base.drawing.source === "pdf" || base.drawing.source === "image"
          ? "A PDF page or a picture carries no shapes to read, so nothing could be placed automatically. Use Suggest with AI, or draw the hood and appliances."
          : "This drawing has no closed outlines or blocks to match, so nothing could be placed automatically.",
      );
      return;
    }
    const det = autoDetect(base.drawing, base.inchesPerUnit);
    if (!det.hoods.length) {
      setPlan(base);
      setNotice(det.notes.join(" ") || "Nothing could be placed automatically.");
      return;
    }
    const k = base.inchesPerUnit;
    const hoods: Hood[] = det.hoods.map((h) => ({ ...h.rect, id: newId("h"), axis: h.rect.w >= h.rect.h ? "x" : "y", flip: false }));
    const placed = det.hoods
      .flatMap((h, hi) => h.items.map((it) => ({ id: newId("a"), kind: it.kind, rect: it.rect, hi, span: itemSpan(hoods[hi], it.rect) })))
      .sort((p, q) => p.hi - q.hi || p.span.start - q.span.start);
    const ducts = det.hoods.flatMap((h) => h.ducts.map((pt) => ({ id: newId("d"), ...pt })));
    setPlan({ ...base, hoods, items: placed.map((p) => ({ id: p.id, ...p.rect })), ducts, cabinet: det.tank ?? base.cabinet });
    setActive(0);
    setDesign((d) => ({
      ...d,
      line: placed.map((p) => {
        const a = defaultAppliance(p.kind, p.id);
        return {
          ...a,
          surfaceLength: Math.max(6, Math.min(a.surfaceLength, Math.round(p.span.length * k - 2))),
          surfaceDepth: Math.max(6, Math.min(a.surfaceDepth, Math.round(p.span.depth * k - 4))),
        };
      }),
      ducts: ducts.map((x) => ({ id: x.id, position: 0, shape: "rect" as const, sideA: 14, sideB: 14, diameter: 16 })),
    }));
    const unitsNote = base.unitsConfirmed ? "" : ` Sizes assume ${base.drawing.unitGuess?.label ?? "the guessed units"}; confirm them on the right.`;
    const hoodText = hoods.length === 1 ? "the hood" : `${hoods.length} hoods (each is its own system)`;
    setNotice(`Found ${hoodText}, ${placed.length} cooking appliance${placed.length === 1 ? "" : "s"} and ${ducts.length} duct${ducts.length === 1 ? "" : "s"} in the drawing and placed them. Check each one: move it, delete it or change its kind below.${unitsNote} ${det.notes.join(" ")}`.trim());
  };

  const addFromPlan = (kind: ApplianceKind, r: Rect) => {
    const id = newId("a");
    setPlan((p) => {
      if (!p) return p;
      return { ...p, items: [...p.items, { id, ...r }] };
    });
    setDesign((d) => {
      const base = defaultAppliance(kind, id);
      const hi = plan ? hoodAt(plan, { x: r.x + r.w / 2, y: r.y + r.h / 2 }) : -1;
      const hood = plan?.hoods[hi >= 0 ? hi : current];
      const span = hood ? itemSpan(hood, r) : null;
      const k = plan?.inchesPerUnit ?? 1;
      const along = span ? span.length * k : base.width;
      const across = span ? span.depth * k : base.surfaceDepth + 6;
      return {
        ...d,
        line: [
          ...d.line,
          {
            ...base,
            surfaceLength: Math.max(6, Math.min(base.surfaceLength, Math.round(along - 2))),
            surfaceDepth: Math.max(6, Math.min(base.surfaceDepth, Math.round(across - 4))),
          },
        ],
      };
    });
    setSelected(id);
  };

  const addDuctFromPlan = (p: Pt) => {
    const id = newId("d");
    setPlan((x) => (x ? { ...x, ducts: [...x.ducts, { id, ...p }] } : x));
    setDesign((d) => ({ ...d, ducts: [...d.ducts, { id, position: 0, shape: "rect", sideA: 14, sideB: 14, diameter: 16 }] }));
  };

  const removeFromPlan = (t: Target) => {
    if (!plan) return;
    if (t.t === "item") {
      setPlan({ ...plan, items: plan.items.filter((i) => i.id !== t.id) });
      setDesign((d) => ({ ...d, line: d.line.filter((a) => a.id !== t.id) }));
    } else if (t.t === "duct") {
      setPlan({ ...plan, ducts: plan.ducts.filter((x) => x.id !== t.id) });
      setDesign((d) => ({ ...d, ducts: d.ducts.filter((x) => x.id !== t.id) }));
    } else if (t.t === "hood") {
      setPlan({ ...plan, hoods: plan.hoods.filter((h) => h.id !== t.id) });
      setActive(0);
    }
    else setPlan({ ...plan, [t.t]: undefined });
  };

  const patchHood = (p: Partial<Design["hood"]>) => setDesign((d) => ({ ...d, hood: { ...d.hood, ...p } }));
  const patchDuct = (id: string, p: Partial<Duct>) => setDesign((d) => ({ ...d, ducts: d.ducts.map((x) => (x.id === id ? { ...x, ...p } : x)) }));

  const select = (id: string) => {
    setSelected(id);
    const el = plates.current[id];
    if (el && !el.contains(document.activeElement)) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const flash = (what: "link" | "text") => {
    setCopied(what);
    window.setTimeout(() => setCopied(null), 1800);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#d=${encode(effective)}`;
    try {
      await navigator.clipboard.writeText(url);
      flash("link");
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  const copyText = async () => {
    const lines = [
      `${effective.name}: ${run(effective.hood.length, unit)} hood, ${effective.line.length} appliances`,
      ...result.protections.map((p) => `- ${p.title}: ${p.summary} (${p.flow} flow)`),
      `Total: ${result.flow.total} flow numbers${result.system ? `, ${result.system.tanks} tank(s), ${result.system.gallons} gal` : ""}`,
      `Detectors: ${result.detectors.length}${result.link ? `, ${result.link.ratingF} °F links` : ""}`,
      ...result.findings.filter((f) => f.level !== "note").map((f) => `! ${f.text}`),
      "Pre-design only. Final design by a trained, certified designer per the current manual.",
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      flash("text");
    } catch {}
  };

  const exportDxf = () => {
    const name = (design.name || "line-check").replace(/[^\w.-]+/g, "-").toLowerCase();
    download(`${name}-line-check.dxf`, designToDxf(systems.map((s) => ({ design: s.effective, result: s.result, plan: s.view }))));
  };

  const presetId = PRESETS.find((p) => p.design.name === design.name)?.id ?? "custom";
  const onPlan = !!plan?.hoods.length;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <p className="wordmark">Line Check</p>
          <p className="tagline">Wet chemical pre-design for a commercial cooking line</p>
        </div>
        <div className="topbar-tools">
          <div className="segmented" role="group" aria-label="Units">
            <button type="button" aria-pressed={unit === "in"} onClick={() => setUnit("in")}>
              in.
            </button>
            <button type="button" aria-pressed={unit === "cm"} onClick={() => setUnit("cm")}>
              cm
            </button>
          </div>
          <button type="button" className="btn" onClick={copyLink}>
            {copied === "link" ? "Link copied" : "Copy link"}
          </button>
          <button type="button" className="btn" onClick={exportDxf}>
            Download DXF
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Print sheet
          </button>
        </div>
      </header>

      <main id="main">
        <Hero onFile={openFile} onExamples={() => stageRef.current?.scrollIntoView({ behavior: "smooth" })} busy={loading} error={loadError} />

        {plan && (
          <div ref={studioRef}>
            <PlanStudio
              plan={plan}
              design={design}
              systems={systems.map((s) => ({ view: s.view!, result: s.result }))}
              active={current}
              onActivate={setActive}
              onPlan={setPlan}
              onAddAppliance={addFromPlan}
              onAddDuct={addDuctFromPlan}
              onRemove={removeFromPlan}
              onClose={() => {
                setPlan(null);
                setNotice(null);
              }}
              onExport={exportDxf}
              notice={notice}
              onDetect={() => detect({ ...plan, hoods: [], items: [], ducts: [] })}
              onPage={(n) => lastFile.current && openFile(lastFile.current, n)}
            />
          </div>
        )}

        <Covers />

        <section ref={stageRef} className="stage" aria-labelledby="stage-title">
          {systems.length > 1 && (
            <div className="systems" role="tablist" aria-label="Hoods">
              {systems.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={i === current}
                  className="system-tab"
                  onClick={() => setActive(i)}
                >
                  <span className="system-tab-name">Hood {i + 1}</span>
                  <span className="system-tab-meta">
                    {s.effective.line.length} appliance{s.effective.line.length === 1 ? "" : "s"} · {s.result.flow.total} flow
                    {s.result.findings.some((f) => f.level === "stop") ? " · check" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
          {loose.length > 0 && (
            <p className="loose-note" role="status">
              {loose.length} appliance{loose.length === 1 ? " is" : "s are"} on the plan but under no hood, so {loose.length === 1 ? "it is" : "they are"} not in any system. Move {loose.length === 1 ? "it" : "them"} under a hood, or draw one.
            </p>
          )}
          <div className="stage-head">
            <h2 id="stage-title" className="stage-title">
              {effective.name || "Your line"}
            </h2>
            <div className="presets" role="group" aria-label="Start from">
              <span className="presets-label">{plan ? "Front view of the plan" : "Example kitchens"}</span>
              {!plan &&
                PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="chip"
                    aria-pressed={presetId === p.id}
                    onClick={() => {
                      setDesign(p.design);
                      setSelected(null);
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              <button type="button" className="btn" onClick={() => setFiring((n) => n + 1)} disabled={!effective.line.length}>
                {firing ? "Run it again" : "Run a discharge"}
              </button>
            </div>
          </div>
          <div className="drawing">
            {effective.line.length || effective.ducts.length ? (
              <Elevation design={effective} result={result} unit={unit} selected={selected} onSelect={select} firing={firing} />
            ) : (
              <p className="drawing-empty">Draw the hood and the appliances on the plan above; the front view appears here as you go.</p>
            )}
          </div>
          <ul className="legend" aria-label="Legend">
            <li>
              <span className="key agent" /> Agent pipe and nozzle
            </li>
            <li>
              <span className="key cone" /> Nozzle coverage
            </li>
            <li>
              <span className="key cable" /> Detection line and detectors
            </li>
          </ul>
        </section>

        <div className="bench">
          <div className="bench-main">
            <section aria-labelledby="line-title">
              <div className="section-head">
                <h2 id="line-title">The line, left to right</h2>
                {!onPlan && (
                  <div className="add">
                    <Select label="Add" value={adding} options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} onChange={setAdding} />
                    <button
                      type="button"
                      className="btn primary"
                      disabled={design.line.length >= 10}
                      onClick={() => {
                        const id = newId("a");
                        setDesign((d) => ({ ...d, line: [...d.line, defaultAppliance(adding, id)] }));
                        setSelected(id);
                      }}
                    >
                      Add to line
                    </button>
                  </div>
                )}
              </div>
              {effective.line.length === 0 && <p className="empty-note">No appliances yet.</p>}
              <div className="plates">
                {effective.line.map((a, i) => (
                  <Plate
                    key={a.id}
                    ref={(el) => {
                      plates.current[a.id] = el;
                    }}
                    index={i}
                    count={effective.line.length}
                    appliance={a}
                    protection={result.protections.find((p) => p.ref === a.id)}
                    unit={unit}
                    selected={selected === a.id}
                    placed={!!plan?.items.some((x) => x.id === a.id)}
                    onSelect={() => setSelected(a.id)}
                    onChange={(next) => setDesign((d) => ({ ...d, line: d.line.map((x) => (x.id === a.id ? { ...next, x: x.x, width: plan?.items.some((it) => it.id === a.id) ? x.width : next.width } : x)) }))}
                    onRemove={() => {
                      setDesign((d) => ({ ...d, line: d.line.filter((x) => x.id !== a.id) }));
                      if (plan) setPlan({ ...plan, items: plan.items.filter((x) => x.id !== a.id) });
                    }}
                    onMove={(dir) =>
                      setDesign((d) => {
                        const line = [...d.line];
                        const j = i + dir;
                        [line[i], line[j]] = [line[j], line[i]];
                        return { ...d, line };
                      })
                    }
                  />
                ))}
              </div>
            </section>

            <section aria-labelledby="hood-title" className="panel">
              <h2 id="hood-title">Hood and plenum</h2>
              {onPlan && <p className="panel-note">Length {run(effective.hood.length, unit)}, measured on the plan.</p>}
              <div className="grid-fields">
                {!onPlan && <Length label="Hood length" value={design.hood.length} unit={unit} min={36} max={360} onChange={(v) => patchHood({ length: v })} />}
                <Length label="Hood edge above the cooking surface" value={design.hood.clearance} unit={unit} min={12} max={72} onChange={(v) => patchHood({ clearance: v })} />
                {!onPlan && <Length label="Line starts from the hood's left end" value={design.hood.lineOffset} unit={unit} min={-24} max={120} onChange={(v) => patchHood({ lineOffset: v })} />}
                <Select
                  label="Filter bank"
                  value={design.hood.filterBank}
                  options={[
                    { value: "v-bank", label: "V-bank" },
                    { value: "single", label: "Single bank" },
                  ]}
                  onChange={(v) => patchHood({ filterBank: v })}
                />
                <Length label="Plenum width" value={design.hood.plenumWidth} unit={unit} min={6} max={72} onChange={(v) => patchHood({ plenumWidth: v })} />
              </div>
            </section>

            <section aria-labelledby="duct-title" className="panel">
              <div className="section-head">
                <h2 id="duct-title">Exhaust ducts</h2>
                {!plan && (
                  <button
                    type="button"
                    className="btn"
                    disabled={design.ducts.length >= 4}
                    onClick={() =>
                      setDesign((d) => ({
                        ...d,
                        ducts: [...d.ducts, { id: newId("d"), position: d.hood.length / 2, shape: "rect", sideA: 14, sideB: 14, diameter: 16 }],
                      }))
                    }
                  >
                    Add a duct
                  </button>
                )}
              </div>
              {effective.ducts.length === 0 && <p className="empty-note">{plan ? "Place the duct openings on the plan." : "No duct yet."}</p>}
              {effective.ducts.map((d, i) => {
                const p = result.protections.find((x) => x.ref === d.id);
                const fromPlan = !!plan?.ducts.some((x) => x.id === d.id);
                return (
                  <div key={d.id} className="duct-row">
                    <p className="duct-name">
                      Duct {i + 1}
                      {p && <span className={p.ok ? "duct-verdict" : "duct-verdict bad"}>{p.summary}</span>}
                    </p>
                    <div className="grid-fields">
                      {!fromPlan && <Length label="Centre from the hood's left end" value={d.position} unit={unit} min={0} max={effective.hood.length} onChange={(v) => patchDuct(d.id, { position: v })} />}
                      <Select
                        label="Shape"
                        value={d.shape}
                        options={[
                          { value: "rect", label: "Rectangular" },
                          { value: "round", label: "Round" },
                        ]}
                        onChange={(v) => patchDuct(d.id, { shape: v })}
                      />
                      {d.shape === "rect" ? (
                        <>
                          <Length label="Side A, front to back" value={d.sideA} unit={unit} min={4} max={60} onChange={(v) => patchDuct(d.id, { sideA: v })} />
                          <Length label="Side B, along the hood" value={d.sideB} unit={unit} min={4} max={80} onChange={(v) => patchDuct(d.id, { sideB: v })} />
                        </>
                      ) : (
                        <Length label="Diameter" value={d.diameter} unit={unit} min={4} max={48} onChange={(v) => patchDuct(d.id, { diameter: v })} />
                      )}
                    </div>
                    {p && !p.ok && <p className="duct-why">{p.reason}</p>}
                    {!plan && design.ducts.length > 1 && (
                      <button type="button" className="link" onClick={() => setDesign((x) => ({ ...x, ducts: x.ducts.filter((y) => y.id !== d.id) }))}>
                        Remove duct {i + 1}
                      </button>
                    )}
                  </div>
                );
              })}
            </section>

            <section aria-labelledby="detect-title" className="panel">
              <h2 id="detect-title">Detection and shut-off</h2>
              <div className="grid-fields">
                <Select<DetectorStyle>
                  label="Detector style"
                  value={design.detection.style}
                  options={(Object.keys(DETECTOR_STYLES) as DetectorStyle[]).map((k) => ({ value: k, label: `${DETECTOR_STYLES[k].label}, up to ${DETECTOR_STYLES[k].maxDetectors}` }))}
                  onChange={(v) => setDesign((d) => ({ ...d, detection: { ...d.detection, style: v } }))}
                />
                <Select
                  label="Hottest reading at a detector"
                  value={String(design.detection.ambientF)}
                  options={[90, 100, 120, 150, 180, 225, 260, 290, 330, 360, 400].map((f) => ({ value: String(f), label: `${f} °F · ${fToC(f)} °C` }))}
                  onChange={(v) => setDesign((d) => ({ ...d, detection: { ...d.detection, ambientF: Number(v) } }))}
                />
                <Select<GasValveType>
                  label="Gas shut-off valve"
                  value={design.gasValve.type}
                  options={[
                    { value: "mechanical", label: "Mechanical" },
                    { value: "electrical", label: "Electrical, 110 V" },
                  ]}
                  onChange={(v) => setDesign((d) => ({ ...d, gasValve: { type: v, size: GAS_VALVES[v].find((x) => x.size === d.gasValve.size)?.size ?? GAS_VALVES[v][0].size } }))}
                />
                <Select
                  label="Valve size"
                  value={design.gasValve.size}
                  options={GAS_VALVES[design.gasValve.type].map((v) => ({ value: v.size, label: v.size }))}
                  onChange={(v) => setDesign((d) => ({ ...d, gasValve: { ...d.gasValve, size: v } }))}
                />
              </div>
            </section>
          </div>

          <div className="bench-side">
            <Results result={result} ambientF={design.detection.ambientF} />
            <button type="button" className="btn wide" onClick={copyText}>
              {copied === "text" ? "Summary copied" : "Copy summary as text"}
            </button>
          </div>
        </div>

        {systems.map((s, i) => (
          // Every hood prints its own sheet; on screen only the open one shows.
          <div key={i} className={i === current ? undefined : "print-only"}>
            <Sheet design={s.effective} result={s.result} unit={unit} />
          </div>
        ))}
      </main>

      <footer className="colophon">
        <p>
          Line Check is an independent study tool, not made, checked or endorsed by any system manufacturer. It follows the design limits
          published for one listed pre-engineered wet chemical system; other systems and other editions differ. A real design is made by a person trained and certified on the system that will be installed, from its current
          manual, NFPA 17A and NFPA 96, and approved by the authority having jurisdiction.
        </p>
        <p>
          Drawings are read in the browser. An AI suggestion, only when you ask for one, sends a picture of the current view and its text
          to an AI model&rsquo;s API.
        </p>
        <p className="credit">
          Built by{" "}
          <a href="https://canberkyildiz.netlify.app" rel="author">
            Canberk Yıldız
          </a>
          , who works in fire safety and writes software. Free software under the GNU GPL v3; DWG files are read with LibreDWG.
        </p>
      </footer>
    </>
  );
}
