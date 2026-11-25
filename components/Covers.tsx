import {
  CHARBROILER_CHARCOAL,
  CHARBROILER_GAS,
  CHARBROILER_LAVA,
  CHARBROILER_WOOD,
  FRYER_MODULE,
  FRYER_SINGLE,
  GRIDDLE,
  RANGE,
  WOK,
  type NozzleCode,
} from "@/lib/rules";

/** The nozzle types the rules list for a family of appliances, in the order they first appear. */
const codes = (...rows: { nozzle: NozzleCode }[][]) => [...new Set(rows.flat().map((r) => r.nozzle))];

const HAZARDS: { img: string; title: string; note: string; codes: NozzleCode[]; alt: string }[] = [
  {
    img: "fryer",
    title: "Fryers",
    note: "One pot, or a large vat split into modules, with or without the dripboard.",
    codes: codes(FRYER_SINGLE, FRYER_MODULE),
    alt: "An empty fry basket in a commercial deep fryer",
  },
  {
    img: "range",
    title: "Ranges",
    note: "Burner grates by longest side and area, with or without a back shelf.",
    codes: codes(RANGE),
    alt: "Pots on the burners of a commercial gas range",
  },
  {
    img: "griddle",
    title: "Griddles",
    note: "Flat tops up to 48 in. on the long side, nozzle on an edge or overhead.",
    codes: codes(GRIDDLE),
    alt: "Burger patties pressed on a flat top griddle",
  },
  {
    img: "charbroiler",
    title: "Char-broilers",
    note: "Gas radiant, lava rock, charcoal and wood, with the fuel depth checked.",
    codes: codes(CHARBROILER_GAS, CHARBROILER_LAVA, CHARBROILER_CHARCOAL, CHARBROILER_WOOD),
    alt: "Flames rising from a restaurant char-broiler",
  },
  {
    img: "wok",
    title: "Woks",
    note: "Judged by the pan's diameter and depth, not by the burner.",
    codes: codes(WOK),
    alt: "A wok over a high flame in a commercial kitchen",
  },
];

/** Why the tool exists, and the cooking hazards it knows, each with the nozzles the rules allow. */
export default function Covers() {
  return (
    <section className="covers" aria-labelledby="covers-title">
      <figure className="covers-band">
        <img src="/kitchen/hood-flames.webp" alt="Cooks at a line under an exhaust hood while a pan flares up" width={2400} height={1200} loading="lazy" decoding="async" />
        <figcaption className="covers-band-text">
          <h2 id="covers-title">A grease fire starts on the line and runs up into the hood.</h2>
          <p>
            A wet chemical system puts a nozzle over every hazard, in the plenum and in each duct, and fires them together when a link
            over the line melts. Line Check lays that system out from your drawing, hazard by hazard.
          </p>
        </figcaption>
      </figure>

      <ul className="covers-list">
        {HAZARDS.map((h) => (
          <li key={h.img} className="cover">
            <img src={`/kitchen/${h.img}.webp`} alt={h.alt} width={640} height={800} loading="lazy" decoding="async" />
            <div className="cover-text">
              <h3>{h.title}</h3>
              <p>{h.note}</p>
              <p className="cover-codes">
                <span className="mono">{h.codes.join(" · ")}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="covers-more">Tilt skillets and salamander broilers are checked too. Photos: Pexels.</p>
    </section>
  );
}
