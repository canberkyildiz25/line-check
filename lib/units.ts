export type Unit = "in" | "cm";

const trim = (n: number, places: number) => {
  const s = n.toFixed(places);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

/** Inches to the display unit, as a number. */
export const toUnit = (inches: number, u: Unit) => (u === "in" ? inches : inches * 2.54);
/** Display unit back to inches. */
export const fromUnit = (v: number, u: Unit) => (u === "in" ? v : v / 2.54);

/** "30 in." or "76 cm" */
export const len = (inches: number, u: Unit) =>
  u === "in" ? `${trim(inches, 2)} in.` : `${trim(inches * 2.54, inches * 2.54 >= 100 ? 0 : 1)} cm`;

/** "12 ft 0 in." for long runs in inches, "366 cm" in metric. */
export const run = (inches: number, u: Unit) => {
  if (u === "cm") return `${trim(inches * 2.54, 0)} cm`;
  const ft = Math.floor(inches / 12);
  const rest = inches - ft * 12;
  return rest ? `${ft} ft ${trim(rest, 1)} in.` : `${ft} ft`;
};

/** "35–40 in." or "89–102 cm" */
export const span = ([lo, hi]: [number, number], u: Unit) =>
  u === "in" ? `${trim(lo, 2)}–${trim(hi, 2)} in.` : `${Math.round(lo * 2.54)}–${Math.round(hi * 2.54)} cm`;

export const fToC = (f: number) => Math.round(((f - 32) * 5) / 9);
