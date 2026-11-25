/**
 * A small DXF writer (AutoCAD R12 ASCII, the most widely readable flavour).
 * Only what the design overlay needs: layers, lines, polylines, circles, text.
 */

export interface DxfLayer {
  name: string;
  /** AutoCAD colour index: 1 red, 5 blue, 7 white/black, 8 grey, 3 green. */
  color: number;
  /** "CONTINUOUS" or "DASHED". */
  lineType?: "CONTINUOUS" | "DASHED";
}

type Pt = [number, number];

export class Dxf {
  private layers = new Map<string, DxfLayer>();
  private body: string[] = [];
  private min: Pt = [Infinity, Infinity];
  private max: Pt = [-Infinity, -Infinity];

  /** $INSUNITS: 1 inches, 4 millimetres, 5 centimetres, 6 metres. */
  constructor(private units: number = 1) {}

  layer(l: DxfLayer) {
    this.layers.set(l.name, l);
    return this;
  }

  private grow([x, y]: Pt) {
    this.min = [Math.min(this.min[0], x), Math.min(this.min[1], y)];
    this.max = [Math.max(this.max[0], x), Math.max(this.max[1], y)];
  }

  private push(...pairs: Array<[number, string | number]>) {
    for (const [code, value] of pairs) this.body.push(String(code), typeof value === "number" ? num(value) : value);
  }

  line(layer: string, a: Pt, b: Pt) {
    this.grow(a);
    this.grow(b);
    this.push([0, "LINE"], [8, layer], [10, a[0]], [20, a[1]], [30, 0], [11, b[0]], [21, b[1]], [31, 0]);
    return this;
  }

  polyline(layer: string, pts: Pt[], closed = false) {
    if (pts.length < 2) return this;
    pts.forEach((p) => this.grow(p));
    this.push([0, "POLYLINE"], [8, layer], [66, 1], [10, 0], [20, 0], [30, 0], [70, closed ? 1 : 0]);
    for (const p of pts) this.push([0, "VERTEX"], [8, layer], [10, p[0]], [20, p[1]], [30, 0]);
    this.push([0, "SEQEND"], [8, layer]);
    return this;
  }

  rect(layer: string, x: number, y: number, w: number, h: number) {
    return this.polyline(layer, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true);
  }

  circle(layer: string, c: Pt, r: number) {
    this.grow([c[0] - r, c[1] - r]);
    this.grow([c[0] + r, c[1] + r]);
    this.push([0, "CIRCLE"], [8, layer], [10, c[0]], [20, c[1]], [30, 0], [40, r]);
    return this;
  }

  /** Text with its insertion point at the bottom left (or centred when align = "center"). */
  text(layer: string, at: Pt, height: number, value: string, align: "left" | "center" = "left") {
    this.grow(at);
    const clean = value.replace(/[\r\n]+/g, " ").replace(/°/g, "%%d").replace(/×/g, "x").replace(/–/g, "-");
    this.push([0, "TEXT"], [8, layer], [10, at[0]], [20, at[1]], [30, 0], [40, height], [1, clean]);
    if (align === "center") this.push([72, 1], [11, at[0]], [21, at[1]], [31, 0]);
    return this;
  }

  toString() {
    const out: string[] = [];
    const add = (...pairs: Array<[number, string | number]>) => {
      for (const [code, value] of pairs) out.push(String(code), typeof value === "number" ? num(value) : value);
    };
    const [x0, y0] = Number.isFinite(this.min[0]) ? this.min : [0, 0];
    const [x1, y1] = Number.isFinite(this.max[0]) ? this.max : [0, 0];
    add([0, "SECTION"], [2, "HEADER"], [9, "$ACADVER"], [1, "AC1009"], [9, "$INSUNITS"], [70, this.units]);
    add([9, "$EXTMIN"], [10, x0], [20, y0], [30, 0], [9, "$EXTMAX"], [10, x1], [20, y1], [30, 0], [0, "ENDSEC"]);
    add([0, "SECTION"], [2, "TABLES"]);
    add([0, "TABLE"], [2, "LTYPE"], [70, 2]);
    add([0, "LTYPE"], [2, "CONTINUOUS"], [70, 0], [3, "Solid line"], [72, 65], [73, 0], [40, 0]);
    add([0, "LTYPE"], [2, "DASHED"], [70, 0], [3, "Dashed __ __ __"], [72, 65], [73, 2], [40, 0.75], [49, 0.5], [49, -0.25]);
    add([0, "ENDTAB"]);
    add([0, "TABLE"], [2, "LAYER"], [70, this.layers.size + 1]);
    add([0, "LAYER"], [2, "0"], [70, 0], [62, 7], [6, "CONTINUOUS"]);
    for (const l of this.layers.values()) add([0, "LAYER"], [2, l.name], [70, 0], [62, l.color], [6, l.lineType ?? "CONTINUOUS"]);
    add([0, "ENDTAB"], [0, "ENDSEC"]);
    add([0, "SECTION"], [2, "ENTITIES"]);
    out.push(...this.body);
    add([0, "ENDSEC"], [0, "EOF"]);
    return out.join("\r\n") + "\r\n";
  }
}

const num = (n: number) => {
  if (!Number.isFinite(n)) return "0";
  const s = n.toFixed(4);
  return s.replace(/\.?0+$/, "") || "0";
};
