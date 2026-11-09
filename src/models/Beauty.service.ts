/**
 * AI Beauty: turns a shopper's skin quiz into a morning and evening routine
 * built only from products the shop has in stock.
 *
 * Claude gets the catalog and the answers and returns a routine as
 * structured JSON (validated against the schema below, so there is no
 * free text to pick apart). Every product it names is then checked against
 * the catalog here — an id that isn't in it, or a product used twice, is
 * dropped — so the shopper can only ever be shown, and add to the bag,
 * something that exists and is for sale.
 *
 * The API key stays on this server (ANTHROPIC_API_KEY); the browser only
 * ever talks to /ai/routine.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import ProductModel from "../schema/Product.model";
import { ProductStatus } from "../libs/enums/product.enum";
import { Product } from "../libs/types/product";
import Errors, { HttpCode, Message } from "../libs/Errors";
import type { RoutineInput } from "../libs/validation";

const MODEL = "claude-opus-5-5";

const LANGUAGE_NAMES: Record<RoutineInput["lang"], string> = {
  uz: "Uzbek (Latin script)",
  ru: "Russian",
  en: "English",
};

const StepSchema = z.object({
  productId: z.string(),
  step: z.string(),
  why: z.string(),
  howToUse: z.string(),
});

const RoutineSchema = z.object({
  summary: z.string(),
  morning: z.array(StepSchema),
  evening: z.array(StepSchema),
  tips: z.array(z.string()),
  seeDermatologist: z.boolean(),
});

/**
 * The fixed half of the prompt. Kept free of anything that changes per
 * request (the language and the answers go in the user message), so with
 * the catalog after it the whole system prompt is cached between shoppers.
 */
const INSTRUCTIONS = `You are the skincare advisor for K-Glow Secrets, a small shop in Uzbekistan that sells original Korean skincare and makeup.

A shopper has answered a short skin quiz. Build them a morning and an evening routine using only products from the catalog below. Refer to each product by its "id" exactly as written in the catalog. If the catalog has nothing suitable for a step, leave that step out — never invent a product.

How to build it:
- "simple" routine: at most 3 steps in the morning and 3 in the evening. "full" routine: at most 6 each.
- Order steps the way they are applied: cleanser first, then toner/essence, serum or treatment, moisturizer; in the morning, sunscreen last if the catalog has one.
- A product may appear in both the morning and the evening when that is how it is used, but never twice in the same routine.
- Match products to the skin type and concerns; for sensitive skin, avoid strong acids, retinoids and heavy fragrance unless the product is made for sensitive skin.
- Makeup only belongs in a routine if the shopper's note asks for it.

What to write, in the language the shopper's message asks for:
- "step": a two-to-three-word name for the step (for example "Cleanser", "Sunscreen").
- "why": one short sentence on why this product suits this shopper.
- "howToUse": one short sentence of instruction.
- "summary": two sentences at most, speaking to the shopper about their skin and the routine.
- "tips": two or three short, practical habits that go with the routine.
- "seeDermatologist": true when the answers or note suggest something a doctor should look at (painful or cystic acne, a sudden rash, broken or bleeding skin). Then say so gently in the summary. This is shopping advice, not a diagnosis.`;

type CatalogProduct = Product & { _id: { toString(): string } };

function trim(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

class BeautyService {
  private client: Anthropic | null = null;

  /** Created on first use, and only when the key is configured. */
  private getClient(): Anthropic {
    if (!process.env.ANTHROPIC_API_KEY)
      throw new Errors(HttpCode.BAD_REQUEST, Message.AI_OFF);
    this.client ??= new Anthropic();
    return this.client;
  }

  public async buildRoutine(input: RoutineInput) {
    const client = this.getClient();

    const catalog = (await ProductModel.find({
      productStatus: ProductStatus.PROCESS,
      productLeftCount: { $gt: 0 },
    })
      .sort({ productBrand: 1, productName: 1 })
      .lean()
      .exec()) as unknown as CatalogProduct[];
    if (!catalog.length) throw new Errors(HttpCode.BAD_REQUEST, Message.AI_FAILED);

    // Sorted, so the same stock always renders the same text and the cache
    // keeps hitting until a product actually changes.
    const catalogText = JSON.stringify(
      catalog.map((p) => ({
        id: p._id.toString(),
        brand: p.productBrand,
        name: p.productName,
        category: p.productCategory,
        volume: p.productVolume,
        price: p.productPrice,
        description: trim(p.productDesc, 400),
        howToUse: trim(p.productHowToUse, 200),
        suitableFor: trim(p.productSuitableFor, 200),
      })),
    );

    const answers = [
      `Write everything in ${LANGUAGE_NAMES[input.lang]}.`,
      `Skin type: ${input.skinType === "unsure" ? "not sure" : input.skinType}`,
      `Concerns: ${input.concerns.length ? input.concerns.join(", ").replace(/_/g, " ") : "none in particular"}`,
      `Sensitive skin: ${input.sensitive ? "yes" : "no"}`,
      `Routine: ${input.size}`,
      input.note ? `Shopper's note: ${input.note}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let response;
    try {
      response = await client.beta.messages.parse({
        model: MODEL,
        max_tokens: 4000,
        // Picking from ~50 products is light work; low effort keeps the
        // wait to a few seconds.
        output_config: { effort: "low", format: betaZodOutputFormat(RoutineSchema) },
        // If Claude's safety checks decline (a false positive on a skin
        // question), another Claude model answers instead of the shopper
        // seeing an error.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: [
          { type: "text", text: INSTRUCTIONS },
          {
            type: "text",
            text: `Catalog (JSON):\n${catalogText}`,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: answers }],
      });
    } catch (err) {
      console.log("Error, buildRoutine (Claude):", err);
      throw new Errors(HttpCode.INTERNAL_SERVER_ERROR, Message.AI_FAILED);
    }

    console.log(
      "AI routine:",
      response.model,
      response.stop_reason,
      JSON.stringify(response.usage),
    );
    const routine = response.parsed_output;
    if (response.stop_reason === "refusal" || !routine)
      throw new Errors(HttpCode.INTERNAL_SERVER_ERROR, Message.AI_FAILED);

    const byId = new Map(catalog.map((p) => [p._id.toString(), p]));
    const resolve = (steps: z.infer<typeof StepSchema>[]) => {
      const seen = new Set<string>();
      return steps.flatMap((s) => {
        const product = byId.get(s.productId);
        if (!product || seen.has(s.productId)) return [];
        seen.add(s.productId);
        return [{ step: s.step, why: s.why, howToUse: s.howToUse, product }];
      });
    };

    const morning = resolve(routine.morning);
    const evening = resolve(routine.evening);
    if (!morning.length && !evening.length)
      throw new Errors(HttpCode.INTERNAL_SERVER_ERROR, Message.AI_FAILED);

    return {
      summary: routine.summary,
      tips: routine.tips.slice(0, 3),
      seeDermatologist: routine.seeDermatologist,
      morning,
      evening,
    };
  }
}

export default BeautyService;
