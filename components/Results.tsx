"use client";

import type { Result } from "@/lib/engine";
import { fToC } from "@/lib/units";

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function Results({ result, ambientF }: { result: Result; ambientF: number }) {
  const { flow, system, findings, detectors, link } = result;
  const stops = findings.filter((f) => f.level === "stop");
  const checks = findings.filter((f) => f.level === "check");
  const notes = findings.filter((f) => f.level === "note");
  const cap = system ? system.max : null;

  return (
    <aside className="results" aria-labelledby="results-title">
      <h2 id="results-title" className="results-title">
        The check
      </h2>

      <div className="total" aria-live="polite">
        <p className="total-figure">
          <span className="num">{fmt(flow.total)}</span>
          <span className="of">{cap ? `of ${cap}` : ""}</span>
        </p>
        <p className="total-label">flow numbers</p>
        {cap && (
          <div className="gauge" aria-hidden="true">
            <span style={{ transform: `scaleX(${Math.min(1, flow.total / cap)})` }} />
          </div>
        )}
      </div>

      <dl className="tally">
        <div>
          <dt>Duct</dt>
          <dd>{fmt(flow.duct)}</dd>
        </div>
        <div>
          <dt>Plenum</dt>
          <dd>{fmt(flow.plenum)}</dd>
        </div>
        <div>
          <dt>Appliances</dt>
          <dd>{fmt(flow.appliance)}</dd>
        </div>
      </dl>

      <section className="system" aria-label="Tanks and cartridge">
        {system ? (
          <>
            <p className="system-head">
              {system.tanks} tank{system.tanks > 1 ? "s" : ""}, {fmt(system.gallons)} gal of agent
            </p>
            <ul>
              {system.hardware.map((h) => (
                <li key={h}>{h}</li>
              ))}
              {system.cartridges.map((c) => (
                <li key={c}>Nitrogen cartridge {c}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="system-head">No system fits {fmt(flow.total)} flow numbers in this tool.</p>
        )}
      </section>

      <section className="system" aria-label="Detection">
        <p className="system-head">
          {detectors.length} detector{detectors.length === 1 ? "" : "s"}
          {link ? `, ${link.ratingF} °F links` : ""}
        </p>
        <p className="system-sub">
          {link
            ? `For up to ${ambientF} °F (${fToC(ambientF)} °C) at the detectors: ${link.style}-style, ${link.ratingF} °F / ${link.ratingC} °C.`
            : "No link is listed for that temperature."}
        </p>
      </section>

      <section className="findings" aria-label="Findings">
        {stops.length === 0 && checks.length === 0 ? (
          <p className="all-clear">Every hazard is inside a listed limit.</p>
        ) : null}
        {[...stops, ...checks].map((f, i) => (
          <p key={i} className={`finding ${f.level}`}>
            <span className="tag">{f.level === "stop" ? "Stop" : "Check"}</span>
            <span>
              {f.text}
            </span>
          </p>
        ))}
        {notes.length > 0 && (
          <details className="notes">
            <summary>
              {notes.length} note{notes.length === 1 ? "" : "s"}
            </summary>
            {notes.map((f, i) => (
              <p key={i} className="finding note">
                <span>
                  {f.text}
                </span>
              </p>
            ))}
          </details>
        )}
      </section>
    </aside>
  );
}
