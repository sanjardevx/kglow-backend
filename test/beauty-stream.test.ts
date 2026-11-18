import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { addProduct, signup, startTestApp, type TestApp } from "./helpers";
import { partialReply } from "../src/models/Beauty.service";

// Claude's side, streamed: each scripted turn becomes a stream whose text
// arrives a few characters at a time, then the finished message.
type Turn = { stop_reason?: string; content?: any[]; parsed_output?: any };
let turns: Array<(params: any, ids: string[]) => Turn> = [];
let streamCalls = 0;

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        parse: async () => {
          throw new Error("the chat should stream");
        },
        stream: (params: any) => {
          streamCalls++;
          const listeners: Array<(delta: string, snapshot: string) => void> = [];
          const catalogText: string = params.system[0].text;
          const ids = JSON.parse(catalogText.slice(catalogText.indexOf("["))).map(
            (p: { id: string }) => p.id,
          );
          return {
            on(event: string, fn: (delta: string, snapshot: string) => void) {
              if (event === "text") listeners.push(fn);
              return this;
            },
            async finalMessage() {
              const turn = turns.shift()!(params, ids);
              const text = turn.parsed_output
                ? JSON.stringify(turn.parsed_output)
                : (turn.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
              for (let i = 4; i < text.length + 4; i += 4) {
                const snapshot = text.slice(0, i);
                listeners.forEach((fn) => fn(snapshot.slice(i - 4), snapshot));
              }
              return {
                model: params.model,
                stop_reason: turn.stop_reason ?? "end_turn",
                usage: {},
                content: turn.content ?? [{ type: "text", text }],
                parsed_output: turn.parsed_output ?? null,
              };
            },
          };
        },
      },
    };
  },
}));

let ctx: TestApp;
let token: string;

beforeAll(async () => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  ctx = await startTestApp();
  token = (await signup(ctx.app, "ai-streamer")).token;
});
afterAll(async () => ctx.stop());
beforeEach(() => {
  turns = [];
  streamCalls = 0;
});

const ask = (body: object, auth = true) => {
  const req = request(ctx.app).post("/ai/chat/stream");
  if (auth) req.set("Authorization", `Bearer ${token}`);
  return req.send(body);
};
const events = (text: string) =>
  text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const left = async () =>
  (await request(ctx.app).get("/ai/status").set("Authorization", `Bearer ${token}`)).body.left;

describe("Reading a reply that is still being written", () => {
  it("finds the reply text as soon as it starts", () => {
    expect(partialReply("")).toBeNull();
    expect(partialReply('{"rep')).toBeNull();
    expect(partialReply('{"reply":"')).toBe("");
    expect(partialReply('{"reply":"Hel')).toBe("Hel");
    expect(partialReply('{"reply":"Say \\"hi\\"')).toBe('Say "hi"');
    expect(partialReply('{"reply":"line\\nnext')).toBe("line\nnext");
    // Cut in the middle of an escape: everything before it.
    expect(partialReply('{"reply":"ok\\')).toBe("ok");
    expect(partialReply('{"reply":"ok\\u00')).toBe("ok");
    expect(partialReply('{"reply":"Done.","productIds":["a"')).toBe("Done.");
  });
});

describe("AI Beauty streamed chat", () => {
  it("streams the reply, the tool lookups, then the checked answer", async () => {
    const serum = await addProduct({ productName: "Glow serum" });
    turns = [
      () => ({
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Checking." },
          {
            type: "tool_use",
            id: "call_0",
            name: "get_product_details",
            input: { productIds: [String(serum._id)] },
          },
        ],
      }),
      () => ({
        parsed_output: {
          reply: "Bu serum terini oʻzgartiradi, sizga to'g'ri keladi.",
          productIds: [String(serum._id), "000000000000000000000000"],
        },
      }),
    ];

    const res = await ask({
      messages: [{ role: "user", content: "Nima tavsiya qilasiz?" }],
      lang: "uz",
    }).expect(200);
    expect(res.headers["content-type"]).toMatch(/application\/x-ndjson/);
    expect(res.headers["x-accel-buffering"]).toBe("no");

    const all = events(res.text);
    expect(all[0]).toEqual({ type: "tools", names: ["get_product_details"] });

    // The reply grows piece by piece, each piece starting with the last.
    const replies = all.filter((e) => e.type === "reply").map((e) => e.text);
    expect(replies.length).toBeGreaterThan(3);
    replies.slice(1).forEach((text, i) => expect(text.startsWith(replies[i])).toBe(true));
    // Uzbek apostrophes are fixed while streaming too.
    expect(replies.at(-1)).toBe("Bu serum terini oʻzgartiradi, sizga toʻgʻri keladi.");

    const done = all.at(-1);
    expect(done.type).toBe("done");
    expect(done.reply).toBe(replies.at(-1));
    expect(done.products.map((p: any) => p._id)).toEqual([String(serum._id)]);
    expect(done.left).toBe(4);
    expect(streamCalls).toBe(2);
  });

  it("starts over when an Uzbek reply slips into Cyrillic", async () => {
    turns = [
      () => ({ parsed_output: { reply: "Салом, yordam beraman.", productIds: [] } }),
      () => ({ parsed_output: { reply: "Salom, yordam beraman.", productIds: [] } }),
    ];
    const res = await ask({ messages: [{ role: "user", content: "Salom" }], lang: "uz" }).expect(
      200,
    );
    const all = events(res.text);
    const reset = all.findIndex((e) => e.type === "reset");
    expect(reset).toBeGreaterThan(0);
    expect(all.at(-1)).toMatchObject({ type: "done", reply: "Salom, yordam beraman." });
  });

  it("refuses before streaming when the request is wrong", async () => {
    await ask({ messages: [{ role: "user", content: "Hi" }], lang: "en" }, false).expect(401);
    const bad = await ask({ messages: [{ role: "assistant", content: "Hi" }], lang: "en" }).expect(
      400,
    );
    expect(bad.headers["content-type"]).toMatch(/application\/json/);
    expect(streamCalls).toBe(0);
  });

  it("reports a failure mid-answer and gives the try back", async () => {
    const before = await left();
    turns = [
      () => ({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "call_0", name: "search_products", input: { query: "toner" } },
        ],
      }),
      () => ({ stop_reason: "refusal" }),
    ];
    const res = await ask({ messages: [{ role: "user", content: "A toner?" }], lang: "en" }).expect(
      200,
    );
    const all = events(res.text);
    expect(all.at(-1)).toEqual({
      type: "error",
      message: "We couldn't answer just now, please try again.",
    });
    expect(await left()).toBe(before);
  });
});
