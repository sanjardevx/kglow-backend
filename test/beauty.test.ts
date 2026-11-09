import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { addProduct, startTestApp, type TestApp } from "./helpers";
import { ProductStatus } from "../src/libs/enums/product.enum";

// Claude's side, stood in for: it answers with whatever `nextRoutine` builds
// from the catalog it was sent, and remembers the last request.
let lastRequest: any = null;
let nextRoutine: (ids: string[]) => any = () => null;
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
          return {
            model: params.model,
            stop_reason: nextStopReason,
            usage: {},
            parsed_output: nextRoutine(ids),
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

let ctx: TestApp;
const routine = (body: object) => request(ctx.app).post("/ai/routine").send(body);

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  ctx = await startTestApp();
});
afterAll(async () => ctx.stop());
beforeEach(() => {
  lastRequest = null;
  nextStopReason = "end_turn";
});

describe("AI Beauty routine", () => {
  it("builds a routine from in-stock products only", async () => {
    const cleanser = await addProduct({ productName: "Gentle cleanser" });
    const serum = await addProduct({ productName: "Pore serum" });
    const paused = await addProduct({
      productName: "Paused toner",
      productStatus: ProductStatus.PAUSE,
    });
    const empty = await addProduct({ productName: "Empty cream", productLeftCount: 0 });

    nextRoutine = (ids) => ({
      summary: "Oily skin.",
      morning: [step(ids[0], "Cleanser"), step("000000000000000000000000"), step(ids[0])],
      evening: [step(ids[1], "Serum")],
      tips: ["Drink water.", "Sleep.", "Wash pillowcases.", "Extra tip."],
      seeDermatologist: false,
    });

    const res = await routine(answers).expect(200);

    // Only products that can actually be bought went to Claude.
    const sentIds: string = lastRequest.system[1].text;
    expect(sentIds).toContain(String(cleanser._id));
    expect(sentIds).toContain(String(serum._id));
    expect(sentIds).not.toContain(String(paused._id));
    expect(sentIds).not.toContain(String(empty._id));
    // The catalog is the cached part; the answers and language are not.
    expect(lastRequest.system[1].cache_control).toEqual({ type: "ephemeral" });
    expect(lastRequest.messages[0].content).toContain("Uzbek");
    expect(lastRequest.fallbacks).toBe("default");

    // An id Claude made up and a repeated product are both dropped.
    expect(res.body.morning).toHaveLength(1);
    expect(res.body.morning[0].step).toBe("Cleanser");
    expect(res.body.morning[0].product.productName).toBeTruthy();
    expect(res.body.evening).toHaveLength(1);
    expect(res.body.tips).toHaveLength(3);
  });

  it("answers in the language the quiz was taken in", async () => {
    nextRoutine = (ids) => ({
      summary: "s",
      morning: [step(ids[0])],
      evening: [],
      tips: [],
      seeDermatologist: false,
    });
    await routine({ ...answers, lang: "ru" }).expect(200);
    expect(lastRequest.messages[0].content).toContain("Russian");
  });

  it("refuses answers that aren't on the quiz", async () => {
    await routine({ ...answers, skinType: "purple" }).expect(400);
    await routine({ ...answers, concerns: [{ $ne: null }] }).expect(400);
    expect(lastRequest).toBeNull();
  });

  it("reports a failure when Claude declines or names nothing real", async () => {
    nextStopReason = "refusal";
    nextRoutine = () => null;
    const declined = await routine(answers).expect(500);
    expect(declined.body.message).toMatch(/routine/);

    nextStopReason = "end_turn";
    nextRoutine = () => ({
      summary: "s",
      morning: [step("000000000000000000000000")],
      evening: [],
      tips: [],
      seeDermatologist: false,
    });
    await routine(answers).expect(500);
  });

  it("says AI Beauty is off when no key is configured", async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const res = await routine(answers).expect(400);
      expect(res.body.message).toMatch(/AI Beauty/);
    } finally {
      process.env.ANTHROPIC_API_KEY = key;
    }
  });

  it("stops a visitor after six routines an hour", async () => {
    nextRoutine = (ids) => ({
      summary: "s",
      morning: [step(ids[0])],
      evening: [],
      tips: [],
      seeDermatologist: false,
    });
    // Two routines were delivered above; failures and refusals don't count.
    for (let i = 0; i < 4; i++) await routine(answers).expect(200);
    const res = await routine(answers).expect(429);
    expect(res.body.message).toMatch(/Too many/);
  });
});
