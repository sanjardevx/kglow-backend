import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import MemberModel from "../src/schema/Member.model";
import { signup, startTestApp, type TestApp } from "./helpers";

// Google's side, stood in for: each "credential" is just the profile it
// claims, and "forged" is a token whose signature doesn't check out.
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    async verifyIdToken({ idToken }: { idToken: string }) {
      if (idToken.startsWith("forged")) throw new Error("bad signature");
      const payload = JSON.parse(idToken.slice("valid-token:".length));
      return { getPayload: () => payload };
    }
  },
}));

const credential = (payload: object) => "valid-token:" + JSON.stringify(payload);

let ctx: TestApp;
const google = (body: object) => request(ctx.app).post("/member/google").send(body);

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  ctx = await startTestApp();
  // The nickname clash below relies on the unique index, which mongoose
  // otherwise builds in the background while the first tests already run.
  await MemberModel.init();
});
afterAll(async () => ctx.stop());

describe("Google sign-in", () => {
  const amira = {
    sub: "google-1",
    email: "amira@example.com",
    email_verified: true,
    name: "Amira K",
  };

  it("creates the member the first time and signs them in", async () => {
    const res = await google({ credential: credential(amira) }).expect(201);
    expect(res.body.isNew).toBe(true);
    expect(res.body.member.memberNick).toBe("Amira K");
    expect(res.body.member.memberType).toBe("USER");
    expect(res.body.accessToken).toBeTruthy();
    // Never handed back to the browser.
    expect(res.body.member.memberGoogleId).toBeUndefined();
  });

  it("signs the same Google account into the same member next time", async () => {
    const first = await MemberModel.findOne({ memberNick: "Amira K" }).lean();
    const res = await google({ credential: credential(amira) }).expect(200);
    expect(res.body.isNew).toBe(false);
    expect(String(res.body.member._id)).toBe(String((first as any)._id));
  });

  it("gives a second person with the same name a different nickname", async () => {
    const res = await google({
      credential: credential({ ...amira, sub: "google-2", email: "other@example.com" }),
    }).expect(201);
    expect(res.body.member.memberNick).toMatch(/^Amira K \d{3,4}$/);
  });

  it("refuses a token Google didn't sign", async () => {
    await google({ credential: "forged-token-xxxxxxxxxxxxxxxx" }).expect(401);
  });

  it("refuses a blocked member", async () => {
    await MemberModel.updateOne({ memberNick: "Amira K" }, { memberStatus: "BLOCK" });
    await google({ credential: credential(amira) }).expect(403);
  });

  it("tells a Google member trying a password to use the Google button", async () => {
    const res = await request(ctx.app)
      .post("/member/login")
      .send({ memberNick: "Amira K", memberPassword: "anything" });
    // Blocked from the test above, which is checked first.
    expect(res.status).toBe(403);

    await google({
      credential: credential({ sub: "google-3", name: "Bobur", email_verified: false }),
    }).expect(201);
    const login = await request(ctx.app)
      .post("/member/login")
      .send({ memberNick: "Bobur", memberPassword: "anything" })
      .expect(401);
    expect(login.body.message).toMatch(/Google/);
  });

  it("leaves password sign-up working as before", async () => {
    const { token } = await signup(ctx.app, "plain-member");
    expect(token).toBeTruthy();
  });
});
