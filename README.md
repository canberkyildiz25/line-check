# Line Check

Line Check is a pre-design tool for wet chemical fire suppression over a commercial cooking line. Drop a kitchen plan (DWG, DXF, PDF or a picture), draw the hood and the appliances over it, place the tank, the pull station and the gas valve, and the tool works out what the design limits call for: which nozzle covers each hazard and at what height, how many flow numbers the system adds up to, which tanks and cartridge that means, how many detectors go on the line, which fusible link fits the temperature, and whether the cable and pipe runs measured on the plan are inside their limits. It draws the front elevation to scale, plays the discharge sequence, prints a design sheet and gives back a DXF that lands on the original drawing.

I work in fire safety, and this is the check I wanted before a design reaches a certified designer: is this line inside the listed limits, and roughly how big is the system?

**It is a study tool, not a design.** It is not made, checked or endorsed by any system manufacturer. A real design is made by a person trained and certified on the system, from the current manual, NFPA 17A and NFPA 96, and approved by the authority having jurisdiction.

## What it does

- **Reads plans in the browser.** DWG through LibreDWG compiled to WebAssembly, DXF through dxf-parser, PDF through pdf.js, PNG/JPG/WEBP as they are. Blocks are expanded, 3D faces and hatches are skipped. Units come from the file when it says; otherwise they are guessed from the drawing's size and confirmed by the user, or set from two points and a known length. The file never leaves the browser.
- **Finds the line by itself.** Equipment drawn as blocks, closed outlines or four loose lines is matched to the tags and the schedule in the drawing; each hood becomes its own system. A vector PDF gives the same outlines (dashed ones too), its printed scale (1:50) sets the units, and a set of sheets opens on the page that talks about cooking.
- **Reads the equipment list.** Turkish and English equipment names in the drawing's text (fritöz, kuzine, ızgara, davlumbaz, fryer, range, hood…) become suggestions; a size such as `4500*2470*500` is read with them. Clicking one jumps to it on the plan.
- **Optional AI suggestion.** On request, and after a warning, a picture of the current view and the text in it go to Anthropic's API (Claude Opus 5.5, structured output). It proposes the hood, the appliance footprints and the ducts; low-confidence guesses are dropped and everything else is placed for the user to check.
- **Appliances:** fryers (single nozzle and split into modules), tilt skillets, ranges, griddles, gas, lava-rock, charcoal and wood char-broilers, woks and salamanders, checked against the manual's coverage tables and nozzle height bands. If no nozzle fits at the chosen tip height, the tool lists the heights that would work.
- **Ducts, plenum, system, detection** as in the manual: 1W/2W/1W+2W duct rules, every plenum method, the System Selection Guide up to 110 flow numbers, detectors per duct and per appliance, fusible link from the hottest reading.
- **Distribution piping, tank by tank.** The nozzles are shared out between the tanks; each tank's duct, plenum and appliance branch lines, supply line and totals are estimated from the hood geometry and checked against the manual's tables (first to last branch, all branches, per-branch length and flow). A line that will not pack into the smallest system steps up a size.
- **Runs on the plan:** pull station and mechanical gas valve cable (150 ft), pipe to the first nozzle (at least 6 ft for fryers, ranges and woks; supply line under 40 ft), overlapping appliances, line outside the hood.
- **Outputs:** a design sheet (protection by hazard, parts and quantities, piping rules) that prints on A4 landscape; a DXF with layers `LC-HOOD`, `LC-APPLIANCE`, `LC-PIPE`, `LC-NOZZLE`, `LC-DETECTION`, `LC-DEVICE`, `LC-TEXT` in the drawing's own coordinates and units, plus the elevation and the schedule below the plan; a link that reopens the same line.
- **The front page** shows a kitchen photo with an X-ray slider over it and plays the discharge: flames, the link melting, agent down the pipe, every nozzle spraying, the soap blanket, the gas shut off.

Left out on purpose: overlapping appliance protection, chain broilers, electrostatic precipitators, ducts over 135 in. perimeter, systems over 110 flow numbers, routed pipe and fitting counts (lengths are estimates), the manual's 6 and 12 flow exceptions, DWG output (DXF opens in every CAD program). Prices are not given.

## Where the numbers come from

Every limit is in [`lib/rules.ts`](lib/rules.ts), kept as data from the published design limits of one listed pre-engineered wet chemical system. Other systems and other editions differ. No manual text or drawing is reproduced, and no manufacturer, product or part number is named.

Front-page photo: "Kitchen at CIA Copia" by Shrinks99, CC0, via Wikimedia Commons. The system drawn over it is illustrative.

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Plain CSS custom properties in [`app/globals.css`](app/globals.css) over Tailwind CSS 4's base layer: a graphite instrument-panel look on screen, black on white in print
- Archivo, IBM Plex Sans and IBM Plex Mono through `next/font`
- `@mlightcad/libredwg-web` (DWG), `dxf-parser` (DXF), `pdfjs-dist` (PDF)
- `@anthropic-ai/sdk` and `zod` for the optional suggestion route
- Vitest for the rules engine and the drawing helpers

## Run it

```bash
npm install
npm run dev      # http://localhost:3000 (copies the DWG reader and PDF worker into public/ first)
npm test
npm run build
```

### Environment

| Variable | Needed for | Notes |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | the "Suggest with AI" button | Optional. Without it the route answers 503 and the rest of the tool works. Each call costs money on that key; the route allows 12 calls per address per hour. |

## Layout

```
app/
  layout.tsx            fonts and metadata
  page.tsx              renders the workbench
  api/suggest/route.ts  optional AI suggestion (server)
  globals.css           tokens, components, animation, print layout
components/
  Workbench.tsx         state, file loading, address sync, panels
  Hero.tsx              drop zone, X-ray photo, discharge sequence
  PlanStudio.tsx        plan tools, units, hints, AI suggestion
  PlanView.tsx          the plan canvas: pan, zoom, draw, move
  Elevation.tsx         to-scale front elevation (SVG)
  Plate.tsx             one appliance, styled as a nameplate
  Results.tsx           flow numbers, system, detection, findings
  Sheet.tsx             the printable design sheet
  Fields.tsx            length, select and checkbox fields
lib/
  rules.ts              design limits as data
  engine.ts             solve(design): nozzles, flow, system, detectors, findings, parts
  piping.ts             tank-by-tank distribution piping against the manual's tables
  plan.ts               plan placements → design, pipe route, overlay
  drawing.ts            shared drawing model, geometry, hints, unit guess
  load.ts               DWG / DXF / PDF / image readers (browser)
  pdfvector.ts          outlines and printed scale from a PDF page
  boxes.ts              boxes drawn as four loose CAD lines
  detect.ts             finds hoods, appliances and ducts
  dxf.ts                small DXF R12 writer
  export.ts             design → DXF overlay
  presets.ts            three made-up starting lines
  share.ts, units.ts    address encoding, inches and centimetres
scripts/copy-assets.mjs copies the WebAssembly and the PDF worker into public/
```

## Deploy

A Next.js app with one server route; it runs on Vercel. Set `ANTHROPIC_API_KEY` in the project settings to turn the AI suggestion on.

## Licence

GNU General Public License v3 or later (see `LICENSE`), because the DWG reader, LibreDWG, is GPL.

## Author

Made by [Canberk Yıldız](https://canberkyildiz.netlify.app).
