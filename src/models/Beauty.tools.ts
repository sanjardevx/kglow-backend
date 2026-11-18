/**
 * The tools the AI Beauty chat can call. Claude sees a short index of the
 * shop (name, brand, category, price) and asks for more through these:
 * search the shelves, or read a product's full details before recommending
 * it. The server runs each call against MongoDB — in-stock products only —
 * and hands the result back as the tool's answer.
 *
 * Claude's arguments are checked here before anything runs; a bad call
 * comes back as an error Claude can read and correct, never a crash.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { isValidObjectId } from "mongoose";
import { z } from "zod";
import ProductModel from "../schema/Product.model";
import { ProductCategory, ProductStatus } from "../libs/enums/product.enum";

/** Rounds of tool calls in one answer; after this Claude must reply. */
export const MAX_TOOL_ROUNDS = 4;
const SEARCH_LIMIT = 8;
const DETAILS_LIMIT = 4;

const inStock = {
  productStatus: ProductStatus.PROCESS,
  productLeftCount: { $gt: 0 },
};

/** A call Claude got wrong; sent back to it as an error result. */
export class ToolInputError extends Error {}

const SearchInput = z.object({
  query: z.string().trim().min(1).max(60).optional(),
  category: z.enum(ProductCategory).optional(),
  maxPrice: z.number().int().positive().optional(),
});

const DetailsInput = z.object({
  productIds: z.array(z.string()).min(1).max(DETAILS_LIMIT),
});

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function shorten(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** Products whose name, brand, description or "suitable for" mention the
 *  words, optionally within a category and under a price. */
async function searchProducts(input: z.infer<typeof SearchInput>) {
  const filter: Record<string, unknown> = { ...inStock };
  if (input.category) filter.productCategory = input.category;
  if (input.maxPrice) filter.productPrice = { $lte: input.maxPrice };
  if (input.query) {
    const pattern = new RegExp(escapeRegex(input.query), "i");
    filter.$or = ["productName", "productBrand", "productDesc", "productSuitableFor"].map(
      (field) => ({ [field]: pattern }),
    );
  }
  const found = await ProductModel.find(filter)
    .sort({ productViews: -1, productName: 1 })
    .limit(SEARCH_LIMIT)
    .lean()
    .exec();
  return {
    results: found.map((p: any) => ({
      id: String(p._id),
      brand: p.productBrand,
      name: p.productName,
      category: p.productCategory,
      price: p.productPrice,
      suitableFor: shorten(p.productSuitableFor, 100),
    })),
  };
}

/** Everything about a few products, and which of them can't be bought. */
async function getProductDetails(input: z.infer<typeof DetailsInput>) {
  const ids = [...new Set(input.productIds)];
  const valid = ids.filter((id) => isValidObjectId(id));
  const found = (await ProductModel.find({ ...inStock, _id: { $in: valid } })
    .lean()
    .exec()) as any[];
  const byId = new Map(found.map((p) => [String(p._id), p]));
  return {
    products: found.map((p) => ({
      id: String(p._id),
      brand: p.productBrand,
      name: p.productName,
      category: p.productCategory,
      volume: p.productVolume,
      price: p.productPrice,
      left: p.productLeftCount,
      description: shorten(p.productDesc, 400),
      howToUse: shorten(p.productHowToUse, 200),
      suitableFor: shorten(p.productSuitableFor, 200),
    })),
    notAvailable: ids.filter((id) => !byId.has(id)),
  };
}

interface ChatTool {
  definition: Anthropic.Beta.BetaTool;
  run: (input: unknown) => Promise<unknown>;
}

function tool<S extends z.ZodType>(
  definition: Anthropic.Beta.BetaTool,
  schema: S,
  run: (input: z.infer<S>) => Promise<unknown>,
): ChatTool {
  return {
    definition,
    run: async (input) => {
      const parsed = schema.safeParse(input);
      if (!parsed.success)
        throw new ToolInputError(
          `Invalid arguments: ${parsed.error.issues
            .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
            .join("; ")}`,
        );
      return run(parsed.data);
    },
  };
}

export const CHAT_TOOLS: Record<string, ChatTool> = {
  search_products: tool(
    {
      name: "search_products",
      description:
        "Search the shop's in-stock products. Matches the query against product names, brands, descriptions and what they suit (e.g. 'acne', 'niacinamide', 'sunscreen', 'Anua'). Optionally filter by category and a maximum price in Uzbek so'm. Returns up to 8 products with their ids. Use it when the index alone isn't enough to find candidates.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "One or two keywords, in English." },
          category: { type: "string", enum: Object.values(ProductCategory) },
          maxPrice: { type: "integer", description: "Highest price in so'm." },
        },
        additionalProperties: false,
      },
    },
    SearchInput,
    searchProducts,
  ),
  get_product_details: tool(
    {
      name: "get_product_details",
      description:
        "Read the full details of 1–4 products by id: description, how to use, what skin it suits, price and how many are left. Call it on your candidates before recommending them. Ids that are sold out or don't exist come back in notAvailable — never recommend those.",
      input_schema: {
        type: "object",
        properties: {
          productIds: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: DETAILS_LIMIT,
          },
        },
        required: ["productIds"],
        additionalProperties: false,
      },
    },
    DetailsInput,
    getProductDetails,
  ),
};

export const CHAT_TOOL_DEFINITIONS = Object.values(CHAT_TOOLS).map((t) => t.definition);

/** Runs one tool call and shapes the result block that goes back to Claude. */
export async function runToolCall(
  block: Anthropic.Beta.BetaToolUseBlock,
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  const chosen = CHAT_TOOLS[block.name];
  try {
    if (!chosen) throw new ToolInputError(`Unknown tool "${block.name}".`);
    const result = await chosen.run(block.input);
    return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) };
  } catch (err) {
    // Claude's mistakes go back to it to fix; anything else is the server's.
    if (!(err instanceof ToolInputError)) throw err;
    return { type: "tool_result", tool_use_id: block.id, content: err.message, is_error: true };
  }
}
