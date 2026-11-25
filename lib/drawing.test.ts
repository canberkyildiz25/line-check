import { describe, expect, it } from "vitest";
import { I, bulged, findHints, guessUnits, insertMatrix, apply, kindOf, plainText } from "./drawing";
import { namedUnits } from "./load";

describe("drawing helpers", () => {
  it("flattens a half-circle bulge through the far point", () => {
    const pts = bulged(I, [{ x: 0, y: 0, bulge: 1 }, { x: 2, y: 0 }], false);
    const lowest = Math.min(...pts.map((p) => p[1]));
    expect(lowest).toBeCloseTo(-1, 1); // CCW from (0,0) to (2,0) swings below the chord
    expect(pts[pts.length - 1]).toEqual([2, 0]);
  });
  it("places block geometry with an insert transform", () => {
    const m = insertMatrix(100, 50, 2, 2, Math.PI / 2, 0, 0);
    const [x, y] = apply(m, 1, 0);
    expect(x).toBeCloseTo(100);
    expect(y).toBeCloseTo(52);
  });
  it("reads Turkish and English equipment names and sizes", () => {
    const h = findHints([
      { x: 0, y: 0, h: 1, value: " A.22  Orta tip davlumbaz  INOKSAN filtreli  4500*2470*500 1" },
      { x: 0, y: 0, h: 1, value: "E-23 Fritöz - set üstü 400V" },
      { x: 0, y: 0, h: 1, value: "P-05 Yer ızgarası pis su çıkışı" },
      { x: 0, y: 0, h: 1, value: "G-01 Kuzine - set üstü" },
      { x: 0, y: 0, h: 1, value: "Davlumbaz aydınlatma ilavesi" },
    ]);
    expect(h.map((x) => x.kind)).toEqual(["hood", "fryer", "range"]);
    expect(h[0].dims).toEqual([4500, 2470, 500]);
  });
  it("strips MTEXT codes", () => {
    expect(plainText(String.raw`{\fTahoma|b1|i0|c0|p34;\L SAYAC DETAYI}`)).toBe("SAYAC DETAYI");
  });
  it("names equipment blocks written in capitals with their sizes", () => {
    expect(kindOf("OCAK-GAZLI-120_93_25")).toBe("range");
    expect(kindOf("YER OCAGI-80_60_60")).toBe("range");
    expect(kindOf("PAELLA OCAGI-GAZLI-80_93_25")).toBe("range");
    expect(kindOf("BARBEKU IZGARA-GAZLI-120_93_25")).toBe("charbroiler-lava");
    expect(kindOf("YER IZGARASI-118_30")).toBe(null);
    expect(kindOf("DEVRILIR TAVA-GAZLI-80_93_85")).toBe("tilt-skillet");
    expect(kindOf("DAVLUMBAZ-ORTA TIP-400_240_50")).toBe("hood");
    expect(kindOf("KONVEKSYONLU FIRIN-20 GN1_1-GAZLI-99_96_180")).toBe(null);
  });
  it("takes the units from blocks named with their own size", () => {
    const block = (name: string, w: number, h: number) => ({ x: 0, y: 0, w, h, layer: "K", block: name });
    const cm = namedUnits([block("OCAK-GAZLI-120_93_25", 120, 93), block("FRITOZ-80_93_85", 80, 93), block("DAVLUMBAZ-400_240_50", 400, 240), block("40x40 profil", 4, 4)]);
    expect(cm?.inchesPerUnit).toBeCloseTo(1 / 2.54);
    const mm = namedUnits([block("OCAK-120_93_25", 1200, 930), block("FRITOZ-80_93", 800, 930), block("TAVA-80_93", 800, 930)]);
    expect(mm?.inchesPerUnit).toBeCloseTo(1 / 25.4);
    expect(guessUnits(4, { minX: 0, minY: 0, maxX: 20000, maxY: 9000 }, true, 20, cm)).toMatchObject({ label: "centimetres", sure: false });
  });
  it("guesses millimetres for a 20 m metric sheet", () => {
    expect(guessUnits(0, { minX: 0, minY: 0, maxX: 20000, maxY: 9000 }, true)?.label).toBe("millimetres");
    expect(guessUnits(4, { minX: 0, minY: 0, maxX: 20, maxY: 9 }, true)).toMatchObject({ label: "millimetres", sure: true });
  });
});
