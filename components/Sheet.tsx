import type { Design, Result } from "@/lib/engine";
import { MANUAL_EDITION, PIPING_NOTES } from "@/lib/rules";
import { run, type Unit } from "@/lib/units";

/** The design sheet: what to protect, with what, and what to order. Prints on its own. */
export default function Sheet({ design, result, unit }: { design: Design; result: Result; unit: Unit }) {
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return (
    <section className="sheet" aria-labelledby="sheet-title">
      <div className="sheet-head">
        <h2 id="sheet-title">Design sheet</h2>
        <p>
          {design.name} · {run(design.hood.length, unit)} hood · {design.line.length} appliances · {fmt(result.flow.total)} flow numbers
        </p>
      </div>

      <div className="table-wrap">
        <table>
          <caption>Protection, hazard by hazard</caption>
          <thead>
            <tr>
              <th scope="col">Hazard</th>
              <th scope="col">Nozzles</th>
              <th scope="col" className="num">
                Flow
              </th>
              <th scope="col">Placement</th>
            </tr>
          </thead>
          <tbody>
            {result.protections.map((p) => (
              <tr key={p.ref} className={p.ok ? undefined : "bad"}>
                <th scope="row">{p.title}</th>
                <td className="mono">{p.summary}</td>
                <td className="num mono">{fmt(p.flow)}</td>
                <td>{p.ok ? p.placement : p.reason}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total
              </th>
              <td className="num mono">{fmt(result.flow.total)}</td>
              <td>{result.system ? `${result.system.tanks} tank${result.system.tanks > 1 ? "s" : ""}, ${fmt(result.system.gallons)} gal` : "Outside this tool"}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {result.piping && (
        <div className="table-wrap">
          <table>
            <caption>Distribution piping, tank by tank (estimated)</caption>
            <thead>
              <tr>
                <th scope="col">Tank</th>
                <th scope="col" className="num">
                  Flow
                </th>
                <th scope="col">Branch lines</th>
                <th scope="col" className="num">
                  Supply
                </th>
                <th scope="col" className="num">
                  First to last branch
                </th>
                <th scope="col" className="num">
                  All branches
                </th>
                <th scope="col">Check</th>
              </tr>
            </thead>
            <tbody>
              {result.piping.tanks.map((t, k) => {
                const count = (kind: string) => t.branches.filter((b) => b.kind === kind).length;
                const problems = [...t.problems, ...t.branches.flatMap((b) => b.problems)];
                const ft = (inches: number, limit: number) => `${Math.round(inches / 12)} / ${Math.round(limit / 12)} ft`;
                return (
                  <tr key={k} className={problems.length ? "bad" : undefined}>
                    <th scope="row">
                      {k + 1}. {t.gallons} gal
                    </th>
                    <td className="num mono">
                      {fmt(t.flow)} / {t.capacity}
                    </td>
                    <td className="mono">
                      {[count("duct") && `${count("duct")} duct`, count("plenum") && `${count("plenum")} plenum`, count("appliance") && `${count("appliance")} appliance`]
                        .filter(Boolean)
                        .join(", ")}
                    </td>
                    <td className="num mono">{ft(t.supply, t.limits.supply.length)}</td>
                    <td className="num mono">{ft(t.firstToLast, t.limits.firstToLast)}</td>
                    <td className="num mono">{ft(t.branchTotal, t.limits.branchTotal)}</td>
                    <td>{problems.length ? problems.join(" ") : "Inside the limits."}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <ul className="fine assumptions">
            {result.piping.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="sheet-cols">
        <div className="table-wrap">
          <table>
            <caption>Parts to order</caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col" className="num">
                  Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {result.bom.map((b) => (
                <tr key={b.item}>
                  <td>{b.item}</td>
                  <td className="num mono">{fmt(b.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine">Pipe, fittings, conduit, pulley elbows and cable are measured on site and not listed.</p>
        </div>

        <div>
          <h3>Piping</h3>
          <ul className="rules">
            {PIPING_NOTES.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </div>

      <p className="fine source">Figures follow the {MANUAL_EDITION}. Check every figure against the current manual of the system to be installed.</p>
    </section>
  );
}
