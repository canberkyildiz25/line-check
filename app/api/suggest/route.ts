import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * Optional: look at a picture of the part of a plan the user is viewing and
 * propose where the hood, the appliances and the ducts are. The user reviews
 * every proposal before it counts. Needs ANTHROPIC_API_KEY on the server; the
 * rest of the tool works without it.
 */

const KINDS = [
  "fryer",
  "tilt-skillet",
  "range",
  "griddle",
  "charbroiler-gas",
  "charbroiler-lava",
  "charbroiler-charcoal",
  "charbroiler-wood",
  "wok",
  "salamander",
] as const;

const Box = z.object({
  x0: z.number().describe("Left edge as a fraction of the image width, 0 to 1"),
  y0: z.number().describe("Top edge as a fraction of the image height, 0 to 1"),
  x1: z.number().describe("Right edge as a fraction of the image width, 0 to 1"),
  y1: z.number().describe("Bottom edge as a fraction of the image height, 0 to 1"),
});

const Suggestion = z.object({
  hood: Box.nullable().describe("The exhaust hood over the cooking line, or null if none is visible"),
  appliances: z.array(
    Box.extend({
      kind: z.enum(KINDS),
      label: z.string().describe("The name or tag written on the plan for this appliance, or a short description"),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
  ducts: z.array(z.object({ x: z.number(), y: z.number() })).describe("Centres of exhaust duct openings, as fractions"),
  notes: z.string().describe("One or two sentences on what was unclear, in plain English"),
});

export type SuggestResponse = z.infer<typeof Suggestion>;

const SYSTEM = `You read architectural plans of commercial kitchens (top view, drawn in CAD or scanned).
You are shown the part of a plan a user is looking at, plus text strings found in that part of the drawing.
Find the cooking line that sits under an exhaust hood: the hood outline, each cooking appliance's footprint, and the exhaust duct openings.
Give positions as fractions of the image (0,0 is the top-left corner).
Only report appliances that cook with heat and need wet chemical protection (fryers, ranges, griddles, char-broilers, woks, salamanders, tilt skillets). Leave out sinks, tables, fridges, ovens with doors and dishwashers.
Use the text strings and equipment tags to decide the kind. Turkish drawings are common: fritöz = fryer, kuzine or ocak = range, ızgara = char-broiler or grill, lav taşı = lava rock, davlumbaz = hood, devrilir tava = tilt skillet.
If you are unsure about something, mark it low confidence or leave it out, and say so in notes. An empty list is a valid answer.`;

const hits = new Map<string, { n: number; t: number }>();

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "AI suggestions are not set up on this deployment." }, { status: 503 });
  }

  // A light per-address limit; the deployment pays for every call.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const h = hits.get(ip);
  if (h && now - h.t < 60 * 60 * 1000 && h.n >= 12) {
    return Response.json({ error: "That is the limit of suggestions for an hour. Place the rest by hand." }, { status: 429 });
  }
  hits.set(ip, h && now - h.t < 60 * 60 * 1000 ? { n: h.n + 1, t: h.t } : { n: 1, t: now });

  let body: { image?: string; texts?: string[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "The request could not be read." }, { status: 400 });
  }
  const image = typeof body.image === "string" ? body.image : "";
  const m = image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[2].length > 4_500_000) {
    return Response.json({ error: "Send one PNG, JPEG or WEBP picture under 3 MB." }, { status: 400 });
  }
  const texts = (Array.isArray(body.texts) ? body.texts : [])
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.slice(0, 160))
    .slice(0, 300);

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Suggestion) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: `image/${m[1]}` as "image/png" | "image/jpeg" | "image/webp", data: m[2] } },
            {
              type: "text",
              text: texts.length
                ? `Text found in this part of the drawing:\n${texts.map((t) => `- ${t}`).join("\n")}`
                : "No text was found in this part of the drawing.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The model declined to read this drawing. Place the hood and appliances by hand." }, { status: 422 });
    }
    if (!response.parsed_output) {
      return Response.json({ error: "The suggestion came back incomplete. Try a closer view." }, { status: 502 });
    }
    return Response.json(response.parsed_output satisfies SuggestResponse);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "The suggestion service is busy. Try again in a minute." }, { status: 429 });
    }
    if (error instanceof Anthropic.BadRequestError) {
      return Response.json({ error: "The drawing could not be sent as it is. Try a closer view." }, { status: 400 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: "The suggestion service failed. Place the hood and appliances by hand." }, { status: 502 });
    }
    throw error;
  }
}
