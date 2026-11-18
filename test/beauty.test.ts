import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { addProduct, signup, startTestApp, type TestApp } from "./helpers";
import { ProductStatus } from "../src/libs/enums/product.enum";
import ProductModel from "../src/schema/Product.model";
import AiRoutineCacheModel from "../src/schema/AiRoutineCache.model";

// Claude's side, stood in for: it answers with whatever `nextRoutine` or
// `nextChat` builds from the catalog it was sent, and remembers the last
// request.
let lastRequest: any = null;
let nextRoutine: (ids: string[]) => any = () => null;
let nextChat: (ids: string[]) => any = () => null;
let nextStopReason = "end_turn";
let parseCalls = 0;
// Scripted chat turns (tool calls, then an answer), taken in order; when
// empty the chat answers straight away with `nextChat`.
let chatTurns: Array<(params: any, ids: string[]) => any> = [];
// What each request carried, copied at the time it was sent.
let requests: Array<{ messages: any[]; tools?: any[]; tool_choice?: any }> = [];

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        parse: async (params: any) => {
          parseCalls++;
          lastRequest = params;
          requests.push(
            JSON.parse(
              JSON.stringify({
                messages: params.messages,
                tools: params.tools,
                tool_choice: params.tool_choice,
              }),
            ),
          );
          const catalogText: string = params.system[0].text;
          const catalog = JSON.parse(catalogText.slice(catalogText.indexOf("[")));
          const ids = catalog.map((p: { id: string }) => p.id);
          const isChat = params.system[1].text.includes("chat");
          if (isChat && chatTurns.length) {
            const turn = chatTurns.shift()!(params, ids);
            return {
              model: params.model,
              stop_reason: turn.stop_reason ?? "end_turn",
              usage: {},
              content: turn.content ?? [],
              parsed_output: turn.parsed_output ?? null,
            };
          }
          return {
            model: params.model,
            stop_reason: nextStopReason,
            usage: {},
            content: [],
            parsed_output: isChat ? nextChat(ids) : nextRoutine(ids),
          };
        },
      },
    };
  },
}));

const step = (productId: string, name = "Step") => ({
  productId,
  kind: name === "Serum" ? "serum" : "cleanser",
  step: name,
  why: "Suits you.",
  howToUse: "Apply gently.",
});

const answers = {
  skinType: "oily",
  concerns: ["acne", "pores"],
  sensitive: false,
  size: "simple",
  lang: "uz",
};

const simpleRoutine = (ids: string[]) => ({
  summary: "s",
  morning: [step(ids[0])],
  evening: [],
  tips: [],
  seeDermatologist: false,
});

let ctx: TestApp;
let memberCount = 0;
/** A fresh member, so each test starts with all of today's answers. */
const newMember = async () => (await signup(ctx.app, `ai-shopper-${memberCount++}`)).token;

const routine = (token: string, body: object) =>
  request(ctx.app).post("/ai/routine").set("Authorization", `Bearer ${token}`).send(body);
const chat = (token: string, body: object) =>
  request(ctx.app).post("/ai/chat").set("Authorization", `Bearer ${token}`).send(body);
const status = (token: string) =>
  request(ctx.app).get("/ai/status").set("Authorization", `Bearer ${token}`);

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  ctx = await startTestApp();
});
afterAll(async () => ctx.stop());
beforeEach(async () => {
  // Each test asks Claude afresh rather than reusing an earlier test's routine.
  await AiRoutineCacheModel.deleteMany({});
  lastRequest = null;
  requests = [];
  chatTurns = [];
  nextStopReason = "end_turn";
  nextRoutine = simpleRoutine;
});

describe("AI Beauty is for members only", () => {
  it("turns guests away before anything is paid for", async () => {
    await addProduct();
    await request(ctx.app).post("/ai/routine").send(answers).expect(401);
    await request(ctx.app)
      .post("/ai/chat")
      .send({ messages: [{ role: "user", content: "Hi" }], lang: "en" })
      .expect(401);
    await request(ctx.app).get("/ai/status").expect(401);
    expect(lastRequest).toBeNull();
  });
});

describe("AI Beauty routine", () => {
  it("builds a routine from in-stock products only, and saves it", async () => {
    const token = await newMember();
    const cleanser = await addProduct({ productName: "Gentle cleanser" });
    const serum = await addProduct({ productName: "Pore serum" });
    const paused = await addProduct({
      productName: "Paused toner",
      productStatus: ProductStatus.PAUSE,
    });
    const empty = await addProduct({ productName: "Empty cream", productLeftCount: 0 });

    nextRoutine = (ids) => {
      const at = (name: string) => ids.find((id) => id === String(name))!;
      return {
        summary: "Oily skin.",
        morning: [
          step(at(String(cleanser._id)), "Cleanser"),
          step("000000000000000000000000"),
          step(at(String(cleanser._id))),
        ],
        evening: [step(at(String(serum._id)), "Serum")],
        tips: ["Drink water.", "Sleep.", "Wash pillowcases.", "Extra tip."],
        seeDermatologist: false,
      };
    };

    const res = await routine(token, answers).expect(200);

    // Only products that can actually be bought went to Claude.
    const sent: string = lastRequest.system[0].text;
    expect(sent).toContain(String(cleanser._id));
    expect(sent).toContain(String(serum._id));
    expect(sent).not.toContain(String(paused._id));
    expect(sent).not.toContain(String(empty._id));
    // The catalog comes first and is the cached part; the instructions and
    // the language come after it. The quiz needs no tools.
    expect(lastRequest.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(lastRequest.system[2].text).toContain("Uzbek");
    expect(lastRequest.model).toBe("claude-haiku-5-5");
    // Haiku has no server-side fallback; sending one would be refused.
    expect(lastRequest.fallbacks).toBeUndefined();
    expect(lastRequest.tools).toBeUndefined();

    // An id Claude made up and a repeated product are both dropped.
    expect(res.body.morning).toHaveLength(1);
    expect(res.body.morning[0].step).toBe("Cleanser");
    expect(res.body.morning[0].kind).toBe("cleanser");
    expect(res.body.evening[0].kind).toBe("serum");
    expect(res.body.morning[0].product.productName).toBe("Gentle cleanser");
    expect(res.body.evening).toHaveLength(1);
    expect(res.body.tips).toHaveLength(3);
    expect(res.body.answers.skinType).toBe("oily");
    expect(res.body.left).toBe(4);

    // Saved for My Page, read back with today's count.
    const saved = await status(token).expect(200);
    expect(saved.body.left).toBe(4);
    expect(saved.body.limit).toBe(5);
    expect(saved.body.routine.morning[0].product.productName).toBe("Gentle cleanser");
    expect(saved.body.routine.evening[0].product.productName).toBe("Pore serum");
    expect(saved.body.routine.evening[0].kind).toBe("serum");

    // A product that sells out afterwards drops out of the saved routine.
    await ProductModel.updateOne({ _id: serum._id }, { productLeftCount: 0 });
    const later = await status(token).expect(200);
    expect(later.body.routine.evening).toHaveLength(0);
    expect(later.body.routine.morning).toHaveLength(1);
  });

  it("answers in the language the quiz was taken in", async () => {
    const token = await newMember();
    await routine(token, { ...answers, lang: "ru" }).expect(200);
    expect(lastRequest.system[2].text).toContain("Russian");
  });

  it("asks again when Uzbek text slips into Cyrillic, and fixes apostrophes", async () => {
    const token = await newMember();
    let call = 0;
    nextRoutine = (ids) => ({
      ...simpleRoutine(ids),
      summary: call++ === 0 ? "Bu tartib terингизни yumshatadi." : "Bu o'zingiz uchun ta’sirchan teri tartibi.",
    });
    parseCalls = 0;
    const res = await routine(token, answers).expect(200);
    expect(parseCalls).toBe(2);
    expect(res.body.summary).toBe("Bu oʻzingiz uchun taʼsirchan teri tartibi.");
    expect(res.body.left).toBe(4); // still one try for the shopper
  });

  it("refuses answers that aren't on the quiz, without using a try", async () => {
    const token = await newMember();
    await routine(token, { ...answers, skinType: "purple" }).expect(400);
    await routine(token, { ...answers, concerns: [{ $ne: null }] }).expect(400);
    expect(lastRequest).toBeNull();
    expect((await status(token)).body.left).toBe(5);
  });

  it("gives the try back when Claude declines or names nothing real", async () => {
    const token = await newMember();
    nextStopReason = "refusal";
    nextRoutine = () => null;
    const declined = await routine(token, answers).expect(500);
    expect(declined.body.message).toMatch(/routine/);

    nextStopReason = "end_turn";
    nextRoutine = () => simpleRoutine(["000000000000000000000000"]);
    await routine(token, answers).expect(500);

    expect((await status(token)).body.left).toBe(5);
  });

  it("says AI Beauty is off when no key is configured", async () => {
    const token = await newMember();
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await routine(token, answers).expect(400);
      expect(res.body.message).toMatch(/AI Beauty/);
    } finally {
      process.env.ANTHROPIC_API_KEY = key;
    }
    expect((await status(token)).body.left).toBe(5);
  });
});

describe("AI Beauty chat", () => {
  it("answers with a short reply and real products only", async () => {
    const token = await newMember();
    nextChat = (ids) => ({
      reply: "Try this gentle cleanser.",
      productIds: [ids[0], ids[0], "000000000000000000000000", ids[1], ids[2], ids[3], ids[4]],
    });
    const res = await chat(token, {
      messages: [{ role: "user", content: "What helps with acne?" }],
      lang: "en",
    }).expect(200);

    expect(res.body.reply).toBe("Try this gentle cleanser.");
    // Repeats and made-up ids dropped, at most four cards.
    expect(res.body.products.length).toBeLessThanOrEqual(4);
    const ids = res.body.products.map((p: { _id: string }) => p._id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("000000000000000000000000");
    expect(res.body.left).toBe(4);
    expect(lastRequest.system[1].text).toContain("Only help with skincare");
    expect(lastRequest.system[2].text).toContain("English");
  });

  it("sends only the latest messages, starting with the shopper's", async () => {
    const token = await newMember();
    nextChat = () => ({ reply: "ok", productIds: [] });
    const messages = Array.from({ length: 11 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
    }));
    await chat(token, { messages, lang: "uz" }).expect(200);

    expect(lastRequest.messages.length).toBeLessThanOrEqual(8);
    expect(lastRequest.messages[0].role).toBe("user");
    expect(lastRequest.messages.at(-1).content).toBe("message 10");
  });

  it("needs the shopper's question last", async () => {
    const token = await newMember();
    await chat(token, {
      messages: [{ role: "assistant", content: "Hello" }],
      lang: "en",
    }).expect(400);
    await chat(token, { messages: [{ role: "user", content: "x".repeat(1001) }], lang: "en" }).expect(400);
    expect(lastRequest).toBeNull();
  });
});

describe("AI Beauty daily limit", () => {
  it("allows five answers a day per member, quiz and chat together", async () => {
    const token = await newMember();
    nextChat = () => ({ reply: "ok", productIds: [] });
    // A note makes each quiz personal, so none is answered from the cache.
    const noted = { ...answers, note: "Dry patches in winter." };
    for (let i = 0; i < 3; i++) await routine(token, noted).expect(200);
    for (let i = 0; i < 2; i++) await chat(token, { messages: [{ role: "user", content: "hi" }], lang: "en" }).expect(200);

    lastRequest = null;
    const res = await routine(token, noted).expect(429);
    expect(res.body.message).toMatch(/today's AI answers/);
    expect(lastRequest).toBeNull();
    expect((await status(token)).body.left).toBe(0);

    // Someone else still has all of theirs.
    const other = await newMember();
    await routine(other, noted).expect(200);
  });

  it("holds when requests arrive at the same time", async () => {
    const token = await newMember();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => routine(token, { ...answers, note: "Oily T-zone." })),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(3);
  });
});

describe("AI Beauty stored routines", () => {
  it("answers the same quiz from the stored routine, free and instantly", async () => {
    const first = await newMember();
    parseCalls = 0;
    const made = await routine(first, answers).expect(200);
    expect(parseCalls).toBe(1);
    expect(made.body.left).toBe(4);

    // Someone else with the same answers: no new call, no try used, and the
    // routine is still saved to their page.
    const second = await newMember();
    const reused = await routine(second, { ...answers, concerns: ["pores", "acne"] }).expect(200);
    expect(parseCalls).toBe(1);
    expect(reused.body.left).toBe(5);
    expect(reused.body.morning).toEqual(made.body.morning);
    const saved = await status(second).expect(200);
    expect(saved.body.routine.morning).toHaveLength(1);
    expect(saved.body.left).toBe(5);

    // Different answers, another language, or a personal note: asked fresh.
    await routine(second, { ...answers, sensitive: true }).expect(200);
    await routine(second, { ...answers, lang: "ru" }).expect(200);
    await routine(second, { ...answers, note: "Red cheeks." }).expect(200);
    expect(parseCalls).toBe(4);
  });

  it("stops matching once the catalog changes", async () => {
    const token = await newMember();
    parseCalls = 0;
    await routine(token, answers).expect(200);
    await routine(token, answers).expect(200);
    expect(parseCalls).toBe(1);

    await addProduct({ productName: "New sunscreen" });
    await routine(token, answers).expect(200);
    expect(parseCalls).toBe(2);
  });

  it("never stores a routine that failed", async () => {
    const token = await newMember();
    nextRoutine = () => simpleRoutine(["000000000000000000000000"]);
    await routine(token, answers).expect(500);
    expect(await AiRoutineCacheModel.countDocuments()).toBe(0);
  });
});

/** A turn where Claude calls tools instead of answering. */
const toolTurn = (...calls: Array<[name: string, input: unknown]>) => ({
  stop_reason: "tool_use",
  content: [
    { type: "text", text: "Let me check." },
    ...calls.map(([name, input], i) => ({ type: "tool_use", id: `call_${i}`, name, input })),
  ],
});
/** The tool results the server sent back in the latest request. */
const lastResults = () =>
  requests.at(-1)!.messages.at(-1).content as Array<{
    tool_use_id: string;
    content: string;
    is_error?: boolean;
  }>;

describe("AI Beauty chat tools", () => {
  it("looks products up in the database before answering", async () => {
    const token = await newMember();
    const serum = await addProduct({
      productName: "Clear serum",
      productSuitableFor: "Oily skin with acne",
      productPrice: 150000,
    });
    await addProduct({
      productName: "Pricey acne gel",
      productSuitableFor: "Acne",
      productPrice: 900000,
    });
    const paused = await addProduct({
      productName: "Paused acne toner",
      productSuitableFor: "Acne",
      productStatus: ProductStatus.PAUSE,
    });

    chatTurns = [
      () => toolTurn(["search_products", { query: "acne", maxPrice: 200000 }]),
      () =>
        toolTurn([
          "get_product_details",
          { productIds: [String(serum._id), String(paused._id), "not-an-id"] },
        ]),
      () => ({ parsed_output: { reply: "Try the serum.", productIds: [String(serum._id)] } }),
    ];
    const res = await chat(token, {
      messages: [{ role: "user", content: "Something for acne under 200k?" }],
      lang: "en",
    }).expect(200);

    // The chat starts from a short index and offers both tools.
    expect(lastRequest.system[0].text).toContain("Shop index");
    expect(lastRequest.system[0].text).not.toContain("suitableFor");
    expect(requests[0].tools.map((t: any) => t.name)).toEqual([
      "search_products",
      "get_product_details",
    ]);
    expect(requests[0].tool_choice).toEqual({ type: "auto" });

    // Search: in stock, matching, under the price.
    const search = JSON.parse(requests[1].messages.at(-1).content[0].content);
    expect(search.results.map((p: any) => p.name)).toEqual(["Clear serum"]);
    // Claude's own turn is sent back before the results.
    expect(requests[1].messages.at(-2).role).toBe("assistant");
    expect(requests[1].messages.at(-2).content[1]).toMatchObject({
      type: "tool_use",
      id: "call_0",
      name: "search_products",
    });

    // Details: the real product, and the rest marked not available.
    const details = JSON.parse(lastResults()[0].content);
    expect(details.products.map((p: any) => p.name)).toEqual(["Clear serum"]);
    expect(details.products[0].left).toBe(10);
    expect(details.notAvailable).toEqual([String(paused._id), "not-an-id"]);

    expect(res.body.reply).toBe("Try the serum.");
    expect(res.body.products.map((p: any) => p._id)).toEqual([String(serum._id)]);
    // Three calls to Claude, one of the shopper's tries.
    expect(parseCalls).toBeGreaterThanOrEqual(3);
    expect(res.body.left).toBe(4);
  });

  it("answers a bad call with an error Claude can fix", async () => {
    const token = await newMember();
    chatTurns = [
      () =>
        toolTurn(
          ["get_product_details", { productIds: [] }],
          ["search_products", { maxPrice: "cheap" }],
          ["delete_everything", {}],
        ),
      () => ({ parsed_output: { reply: "Here you go.", productIds: [] } }),
    ];
    const res = await chat(token, {
      messages: [{ role: "user", content: "Show me something" }],
      lang: "en",
    }).expect(200);

    const results = lastResults();
    expect(results.map((r) => r.tool_use_id)).toEqual(["call_0", "call_1", "call_2"]);
    expect(results.every((r) => r.is_error)).toBe(true);
    expect(results[0].content).toMatch(/productIds/);
    expect(results[1].content).toMatch(/maxPrice/);
    expect(results[2].content).toMatch(/Unknown tool/);
    expect(res.body.reply).toBe("Here you go.");
  });

  it("makes Claude answer after four rounds of tools", async () => {
    const token = await newMember();
    const keepSearching = (params: any) =>
      params.tool_choice?.type === "none"
        ? { parsed_output: { reply: "Done looking.", productIds: [] } }
        : toolTurn(["search_products", { query: "cream" }]);
    chatTurns = Array.from({ length: 10 }, () => keepSearching);

    const res = await chat(token, {
      messages: [{ role: "user", content: "Find me a cream" }],
      lang: "en",
    }).expect(200);

    expect(requests).toHaveLength(5);
    expect(requests.slice(0, 4).every((r) => r.tool_choice.type === "auto")).toBe(true);
    expect(requests[4].tool_choice).toEqual({ type: "none" });
    expect(res.body.reply).toBe("Done looking.");
    expect(res.body.left).toBe(4);
  });

  it("gives the try back when the answer after the tools fails", async () => {
    const token = await newMember();
    chatTurns = [
      () => toolTurn(["search_products", { query: "toner" }]),
      () => ({ stop_reason: "refusal" }),
    ];
    await chat(token, {
      messages: [{ role: "user", content: "A toner?" }],
      lang: "en",
    }).expect(500);
    expect((await status(token)).body.left).toBe(5);
  });
});
