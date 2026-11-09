import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { addProduct, signup, startTestApp, type TestApp } from "./helpers";
import { ProductStatus } from "../src/libs/enums/product.enum";
import ProductModel from "../src/schema/Product.model";

// Claude's side, stood in for: it answers with whatever `nextRoutine` or
// `nextChat` builds from the catalog it was sent, and remembers the last
// request.
let lastRequest: any = null;
let nextRoutine: (ids: string[]) => any = () => null;
let nextChat: (ids: string[]) => any = () => null;
let nextStopReason = "end_turn";

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        parse: async (params: any) => {
          lastRequest = params;
          const catalogText: string = params.system[1].text;
          const catalog = JSON.parse(catalogText.slice(catalogText.indexOf("[")));
          const ids = catalog.map((p: { id: string }) => p.id);
          const isChat = params.system[0].text.includes("chat");
          return {
            model: params.model,
            stop_reason: nextStopReason,
            usage: {},
            parsed_output: isChat ? nextChat(ids) : nextRoutine(ids),
          };
        },
      },
    };
  },
}));

const step = (productId: string, name = "Step") => ({
  productId,
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
beforeEach(() => {
  lastRequest = null;
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
    const sent: string = lastRequest.system[1].text;
    expect(sent).toContain(String(cleanser._id));
    expect(sent).toContain(String(serum._id));
    expect(sent).not.toContain(String(paused._id));
    expect(sent).not.toContain(String(empty._id));
    // The catalog is the cached part; the language comes after it.
    expect(lastRequest.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(lastRequest.system[2].text).toContain("Uzbek");
    expect(lastRequest.fallbacks).toBe("default");

    // An id Claude made up and a repeated product are both dropped.
    expect(res.body.morning).toHaveLength(1);
    expect(res.body.morning[0].step).toBe("Cleanser");
    expect(res.body.morning[0].product.productName).toBe("Gentle cleanser");
    expect(res.body.evening).toHaveLength(1);
    expect(res.body.tips).toHaveLength(3);
    expect(res.body.answers.skinType).toBe("oily");
    expect(res.body.left).toBe(9);

    // Saved for My Page, read back with today's count.
    const saved = await status(token).expect(200);
    expect(saved.body.left).toBe(9);
    expect(saved.body.limit).toBe(10);
    expect(saved.body.routine.morning[0].product.productName).toBe("Gentle cleanser");
    expect(saved.body.routine.evening[0].product.productName).toBe("Pore serum");

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

  it("refuses answers that aren't on the quiz, without using a try", async () => {
    const token = await newMember();
    await routine(token, { ...answers, skinType: "purple" }).expect(400);
    await routine(token, { ...answers, concerns: [{ $ne: null }] }).expect(400);
    expect(lastRequest).toBeNull();
    expect((await status(token)).body.left).toBe(10);
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

    expect((await status(token)).body.left).toBe(10);
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
    expect((await status(token)).body.left).toBe(10);
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
    expect(res.body.left).toBe(9);
    expect(lastRequest.system[0].text).toContain("Only help with skincare");
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
  it("allows ten answers a day per member, quiz and chat together", async () => {
    const token = await newMember();
    nextChat = () => ({ reply: "ok", productIds: [] });
    for (let i = 0; i < 5; i++) await routine(token, answers).expect(200);
    for (let i = 0; i < 5; i++) await chat(token, { messages: [{ role: "user", content: "hi" }], lang: "en" }).expect(200);

    lastRequest = null;
    const res = await routine(token, answers).expect(429);
    expect(res.body.message).toMatch(/10 AI answers/);
    expect(lastRequest).toBeNull();
    expect((await status(token)).body.left).toBe(0);

    // Someone else still has all of theirs.
    const other = await newMember();
    await routine(other, answers).expect(200);
  });

  it("holds when requests arrive at the same time", async () => {
    const token = await newMember();
    const results = await Promise.all(
      Array.from({ length: 14 }, () => routine(token, answers)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(10);
    expect(results.filter((r) => r.status === 429)).toHaveLength(4);
  });
});
