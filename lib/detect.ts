/**
 * Find the hood, the cooking appliances and the ducts in a vector plan without
 * asking anyone. It leans on how kitchen drawings are usually made: every piece
 * of equipment is a closed outline or a block, it carries a tag ("E-23",
 * "Fritöz") and the tag reappears in the equipment schedule with a description.
 * Everything found is a proposal for the user to check.
 */

import { kindOf, type Drawing, type Shape } from "./drawing";
import type { Pt, Rect } from "./plan";
import type { ApplianceKind } from "./rules";

export interface Detected {
  kind: ApplianceKind;
  rect: Rect;
  label: string;
}

export interface DetectedHood {
  rect: Rect;
  /** True when no outline was found and the hood was drawn around its appliances. */
  drawn: boolean;
  items: Detected[];
  ducts: Pt[];
}

export interface Detection {
  /** Largest first. */
  hoods: DetectedHood[];
  notes: string[];
  /** Centre of an existing suppression tank/release block, when the drawing has one. */
  tank?: Pt;
}

const CODE = /^\s*([A-Z]{1,3}\s?[.\-]?\s?\d{1,3}[A-Z]?)\b\s*(.*)$/i;
const norm = (c: string) => c.toUpperCase().replace(/[\s.\-]/g, "");
const DUCT = /\bbaca\b|\bduct\b|exhaust|egzoz|egzost|aspirat/i;
const HOODISH = /davlumbaz|\bhood\b|kanopi|canopy/i;
/** Layer names that usually hold kitchen equipment, and kitchen exhaust ducts. */
const EQUIP_LAYER = /ekipman|equip|cihaz|appliance|mutfak|kitchen|k-eqpm/i;
/** Blocks whose own name says they are something that does not take a wet chemical nozzle. */
const NOT_COOKING = /combi|oven|f[ıi]r[ıi]n|dish ?wash|bula[sş][ıi]k|fridge|refrig|freez|so[gğ]utucu|sink|evye|lavabo|table|tezgah|shelf|raf|mixer|tap\b|batarya|bin\b|[çc][öo]p|trolley|dolly|rack|kettle|pacojet|blast|chiller|ice\b|buz/i;
/** Architectural and furniture layers (AIA "A-", "Q-" casework, "FUR") never hold cooking equipment. */
const ARCH_LAYER = /^a-|^q-|^s-|fur(n|\b|_)|mobilya|furniture|door|kap[ıi]|wall|duvar|glaz/i;

/**
 * Plausible footprint for each kind, in inches: [shorter side min, max], [longer side min, max].
 * Generous on purpose; it only rules out what clearly is something else (a table set, a cold room).
 */
const FOOTPRINT: Record<ApplianceKind, [[number, number], [number, number]]> = {
  fryer: [[10, 40], [14, 48]],
  "tilt-skillet": [[24, 48], [30, 84]],
  range: [[10, 40], [12, 72]],
  griddle: [[10, 40], [12, 72]],
  "charbroiler-gas": [[12, 40], [12, 72]],
  "charbroiler-lava": [[12, 40], [12, 72]],
  "charbroiler-charcoal": [[12, 66], [12, 84]],
  "charbroiler-wood": [[12, 66], [12, 84]],
  wok: [[16, 48], [16, 84]],
  salamander: [[8, 30], [16, 48]],
};

function fitsKind(kind: ApplianceKind, s: Shape, k: number) {
  const a = Math.min(s.w, s.h) * k;
  const b = Math.max(s.w, s.h) * k;
  const [[a0, a1], [b0, b1]] = FOOTPRINT[kind];
  return a >= a0 && a <= a1 && b >= b0 && b <= b1;
}

/** An existing suppression tank or release drawn as a block. */
const TANK = /wet ?chem|suppression|agent tank|s[öo]nd[üu]rme|yang[ıi]n t[üu]p/i;
const DUCT_LAYER = /egzost|egzoz|exhaust|duct|baca|kanal/i;

const inside = (r: Rect, p: Pt, pad = 0) => p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
const centre = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

export function autoDetect(d: Drawing, inchesPerUnit: number): Detection {
  const notes: string[] = [];
  const k = inchesPerUnit;
  const inch = (n: number) => n / k; // inches → drawing units

  // 1. The schedule: code → kind, from rows such as "E-23  Fritöz - set üstü  400V".
  const codes = new Map<string, ApplianceKind | "hood">();
  for (const t of d.texts) {
    const m = t.value.match(CODE);
    if (!m || m[2].length < 3) continue;
    const kind = kindOf(m[2]);
    if (kind) codes.set(norm(m[1]), kind);
  }

  // 2. Labels on the plan: short texts that name a kind or carry a scheduled code.
  const labels: { kind: ApplianceKind | "hood"; at: Pt; text: string }[] = [];
  for (const t of d.texts) {
    const v = t.value.trim();
    if (!v || v.length > 28) continue;
    const m = v.match(CODE);
    const kind = (m && codes.get(norm(m[1]))) || kindOf(v);
    if (!kind) continue;
    labels.push({ kind, at: { x: t.x + Math.min(v.length, 10) * t.h * 0.3, y: t.y + t.h * 0.5 }, text: v });
  }

  // 3. Outlines the right size for an appliance or a hood.
  const sizeIn = (s: Shape) => [Math.min(s.w, s.h) * k, Math.max(s.w, s.h) * k];
  const applianceBoxes = d.shapes.filter((s) => {
    const [a, b] = sizeIn(s);
    return a >= 8 && b <= 84;
  });
  const hoodBoxes = d.shapes.filter((s) => {
    const [a, b] = sizeIn(s);
    return b >= 36 && b <= 480 && a >= 20 && a <= 150;
  });

  const items: Detected[] = [];
  const taken = new Set<Shape>();
  const assign = (kind: ApplianceKind, s: Shape, label: string) => {
    if (taken.has(s)) return;
    taken.add(s);
    items.push({ kind, rect: { x: s.x, y: s.y, w: s.w, h: s.h }, label });
  };

  // Equipment drawn as blocks: each label votes for the block nearest to it (edge distance),
  // and every block of that model takes the winning kind. Tag balloons sit beside the
  // equipment, and model numbers repeat (two fryers share one block), so votes add up.
  const edge = (s: Shape, p: Pt) => Math.hypot(Math.max(s.x - p.x, 0, p.x - (s.x + s.w)), Math.max(s.y - p.y, 0, p.y - (s.y + s.h)));
  // A tag next to a combi oven still means the range beside it: blocks named as something else never take a vote.
  const blockBoxes = applianceBoxes.filter((s) => s.block && !NOT_COOKING.test(s.block) && !TANK.test(s.block) && !ARCH_LAYER.test(s.layer));
  const votes = new Map<string, Map<ApplianceKind, number>>();
  const voted = new Set<(typeof labels)[number]>();
  for (const l of labels) {
    if (l.kind === "hood") continue;
    // The nearest block that is also the right size for what the tag names.
    // A block whose own name already says another kind ("iVario" is a tilt skillet) keeps its name.
    const near = blockBoxes
      .filter((s) => {
        const named = kindOf(s.block!);
        return fitsKind(l.kind as ApplianceKind, s, k) && (!named || named === "hood" || named === l.kind);
      })
      .map((s) => ({ s, dist: edge(s, l.at) }))
      .filter((x) => x.dist <= inch(60))
      .sort((p, q) => p.dist - q.dist)[0];
    if (!near) continue;
    voted.add(l);
    const v = votes.get(near.s.block!) ?? new Map<ApplianceKind, number>();
    v.set(l.kind as ApplianceKind, (v.get(l.kind as ApplianceKind) ?? 0) + 1);
    votes.set(near.s.block!, v);
  }
  const blockKind = (name: string): ApplianceKind | null => {
    const v = votes.get(name);
    if (v) return [...v.entries()].sort((p, q) => q[1] - p[1])[0][0];
    const k2 = kindOf(name);
    return k2 && k2 !== "hood" ? k2 : null;
  };
  const overlaps = (a: Shape, b: Rect) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 && (w * h) / Math.min(a.w * a.h, b.w * b.h) > 0.6;
  };
  for (const s of blockBoxes) {
    const kind = blockKind(s.block!);
    if (!kind || items.some((i) => overlaps(s, i.rect))) continue;
    assign(kind, s, s.block!);
  }

  // Equipment drawn as plain outlines: the label inside (or right next to) the outline names it.
  for (const l of labels) {
    if (l.kind === "hood" || voted.has(l)) continue;
    // Prefer outlines the right size for the kind (a burner grate inside a range is not the range), then the smallest.
    const fits = (s: Shape) => (fitsKind(l.kind as ApplianceKind, s, k) ? 0 : 1);
    const containing = applianceBoxes.filter((s) => !s.block && !ARCH_LAYER.test(s.layer) && inside(s, l.at, Math.max(s.w, s.h) * 0.08) && !taken.has(s));
    let pick = containing.sort((p, q) => fits(p) - fits(q) || p.w * p.h - q.w * q.h)[0];
    if (!pick) {
      const near = applianceBoxes
        .filter((s) => !s.block && !ARCH_LAYER.test(s.layer) && !taken.has(s) && fitsKind(l.kind as ApplianceKind, s, k))
        .map((s) => ({ s, dist: edge(s, l.at) }))
        .filter((x) => x.dist <= inch(24))
        .sort((p, q) => p.dist - q.dist)[0];
      pick = near?.s;
    }
    if (pick && !items.some((i) => overlaps(pick!, i.rect))) assign(l.kind as ApplianceKind, pick, l.text);
  }

  // 4. Hoods. Outlines first (labelled ones, then any that cover two or more appliances); each
  // claims what is under it. What is left is grouped by the nearest hood tag when the drawing
  // has them, otherwise by appliances standing side by side, and each group gets a hood drawn
  // around it. A hood outline is never an appliance itself, and it is bigger than what it covers.
  const area = (r: Rect) => r.w * r.h;
  const claimed = new Set<Detected>();
  const under = (r: Rect) => items.filter((i) => !claimed.has(i) && inside(r, centre(i.rect), Math.max(r.w, r.h) * 0.05) && area(r) > area(i.rect) * 1.2);
  const tags = labels.filter((l) => l.kind === "hood");
  let candidates = hoodBoxes
    .filter((s) => !taken.has(s))
    .map((s) => ({ s, labelled: tags.some((l) => inside(s, l.at, inch(40))) || HOODISH.test(s.layer) || !!(s.block && HOODISH.test(s.block)) }));
  const found: { rect: Rect; drawn: boolean; items: Detected[] }[] = [];
  for (;;) {
    const best = candidates
      .map((c) => ({ ...c, n: under(c.s).length }))
      .filter((c) => c.n >= (c.labelled ? 1 : 2))
      .sort((p, q) => Number(q.labelled) - Number(p.labelled) || q.n - p.n || area(p.s) - area(q.s))[0];
    if (!best) break;
    const got = under(best.s);
    got.forEach((i) => claimed.add(i));
    found.push({ rect: { x: best.s.x, y: best.s.y, w: best.s.w, h: best.s.h }, drawn: false, items: got });
    candidates = candidates.filter((c) => c.s !== best.s && !overlaps(c.s, best.s));
  }
  // Hoods the drawing names but that cover nothing wet chemical protects (ovens, dishwashing, kettles).
  const idleHoods = candidates.filter((c) => c.s.block && HOODISH.test(c.s.block) && under(c.s).length === 0).length;

  const sideBySide = (list: Detected[]) => {
    const groups: Detected[][] = [];
    for (const it of [...list].sort((p, q) => p.rect.x - q.rect.x || p.rect.y - q.rect.y)) {
      const near = groups.filter((grp) =>
        grp.some(
          (o) =>
            Math.abs(centre(o.rect).x - centre(it.rect).x) < inch(24) + (o.rect.w + it.rect.w) / 2 &&
            Math.abs(centre(o.rect).y - centre(it.rect).y) < inch(24) + (o.rect.h + it.rect.h) / 2,
        ),
      );
      if (!near.length) groups.push([it]);
      else {
        // An appliance that touches two groups joins them.
        const merged = near.flat().concat(it);
        for (const g of near) groups.splice(groups.indexOf(g), 1);
        groups.push(merged);
      }
    }
    return groups;
  };
  const rest = items.filter((i) => !claimed.has(i));
  if (rest.length) {
    let groups: Detected[][];
    if (tags.length) {
      const byTag = new Map<number, Detected[]>();
      const loose: Detected[] = [];
      for (const it of rest) {
        const c = centre(it.rect);
        const near = tags.map((t, ti) => ({ ti, dist: Math.hypot(t.at.x - c.x, t.at.y - c.y) })).sort((p, q) => p.dist - q.dist)[0];
        if (near && near.dist <= inch(160)) byTag.set(near.ti, [...(byTag.get(near.ti) ?? []), it]);
        else loose.push(it);
      }
      groups = [...byTag.values(), ...sideBySide(loose)];
    } else groups = sideBySide(rest);
    // Were any hoods found as outlines before these are drawn?
    const some = found.length > 0;
    for (const g of groups) {
      const x0 = Math.min(...g.map((i) => i.rect.x)) - inch(6);
      const y0 = Math.min(...g.map((i) => i.rect.y)) - inch(6);
      const x1 = Math.max(...g.map((i) => i.rect.x + i.rect.w)) + inch(6);
      const y1 = Math.max(...g.map((i) => i.rect.y + i.rect.h)) + inch(6);
      found.push({ rect: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, drawn: true, items: g });
    }
    notes.push(
      groups.length === 1
        ? `${some ? "One group of appliances has no hood outline above it" : "No hood outline was found"}, so one was drawn around ${some ? "it" : "the appliances"} with 6 in. to spare. Check it against the drawing.`
        : `${some ? `${groups.length} groups of appliances have no hood outline above them` : "No hood outlines were found"}, so ${groups.length} were drawn around the appliances with 6 in. to spare. Check them against the drawing.`,
    );
  }

  // 5. Per hood: unnamed outlines under it, and its ducts (a duct layer or a labelled opening, else the middle).
  let unknown = 0;
  let assumedDucts = 0;
  const hoods: DetectedHood[] = found
    .sort((p, q) => q.items.length - p.items.length)
    .map((h) => {
      const r = h.rect;
      for (const s of applianceBoxes) {
        if (taken.has(s) || !inside(r, centre(s)) || !(EQUIP_LAYER.test(s.layer) || s.block)) continue;
        if (s.block) {
          // A block nobody voted for stays unnamed: guessing from the nearest tag mislabels rows.
          if (!items.some((i) => overlaps(s, i.rect))) unknown++;
          continue;
        }
        const near = labels
          .filter((l) => l.kind !== "hood")
          .map((l) => ({ l, dist: Math.hypot(l.at.x - centre(s).x, l.at.y - centre(s).y) }))
          .filter((x) => x.dist <= inch(40))
          .sort((p, q) => p.dist - q.dist)[0];
        if (near) {
          assign(near.l.kind as ApplianceKind, s, near.l.text);
          h.items.push(items[items.length - 1]);
        } else unknown++;
      }
      const ducts: Pt[] = [];
      for (const s of d.shapes) {
        if (!DUCT_LAYER.test(s.layer) || !inside(r, centre(s), inch(12))) continue;
        const [a, b] = [Math.min(s.w, s.h) * k, Math.max(s.w, s.h) * k];
        if (a >= 4 && b <= 60) ducts.push(centre(s));
      }
      for (const t of d.texts) {
        if (t.value.length > 28 || !DUCT.test(t.value)) continue;
        if (inside(r, t, inch(12))) ducts.push({ x: Math.min(r.x + r.w, Math.max(r.x, t.x)), y: Math.min(r.y + r.h, Math.max(r.y, t.y)) });
      }
      if (!ducts.length) {
        ducts.push(centre(r));
        assumedDucts++;
      }
      return { rect: r, drawn: h.drawn, items: h.items, ducts: ducts.slice(0, 4) };
    });
  if (idleHoods)
    notes.push(
      idleHoods === 1
        ? "One more hood in the drawing covers no fryer, range, griddle, broiler, wok or tilt skillet (an oven or dishwashing hood, for example), so it opens no system."
        : `${idleHoods} more hoods in the drawing cover no fryer, range, griddle, broiler, wok or tilt skillet (oven or dishwashing hoods, for example), so they open no system.`,
    );
  if (unknown) notes.push(`${unknown} more outline${unknown === 1 ? "" : "s"} under the hoods could not be named from the drawing; add them if they cook.`);
  if (assumedDucts)
    notes.push(
      assumedDucts === 1
        ? "A duct opening is not marked, so it was put at the middle of its hood. Move it to where the duct really is."
        : `${assumedDucts} duct openings are not marked, so they were put at the middle of their hoods. Move them to where the ducts really are.`,
    );
  if (!hoods.length) notes.push("No cooking appliances could be matched to outlines. Draw them, or use the AI suggestion.");
  // An existing tank block (often drawn by the kitchen consultant) gives the release position.
  const tankShape = d.shapes.find((s) => (s.block && TANK.test(s.block)) || TANK.test(s.layer));
  const tank = tankShape ? centre(tankShape) : undefined;
  if (tank) notes.push("The drawing shows a suppression tank; it was placed as the release, so pipe and cable runs are measured from it.");
  return { hoods, notes, tank };
}
