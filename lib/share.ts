import type { Design } from "./engine";

/** The design travels in the address after `#d=`, so a link opens the same line. */
export function encode(design: Design): string {
  const json = JSON.stringify(design);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decode(text: string): Design | null {
  try {
    const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const d = JSON.parse(new TextDecoder().decode(bytes)) as Design;
    if (!d || typeof d !== "object" || !d.hood || !Array.isArray(d.line) || !Array.isArray(d.ducts)) return null;
    if (typeof d.hood.length !== "number" || d.line.length > 20 || d.ducts.length > 6) return null;
    return d;
  } catch {
    return null;
  }
}
