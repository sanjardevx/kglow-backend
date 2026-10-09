import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { createAdmin, signup, startTestApp, TEST_JWT_SECRET, type TestApp } from "./helpers";

let ctx: TestApp;
beforeAll(async () => {
  ctx = await startTestApp();
});
afterAll(async () => ctx.stop());

const post = (path: string, body: object) => request(ctx.app).post(path).send(body);

describe("signup", () => {
  it("always creates a plain USER, whatever the body claims", async () => {
    const res = await post("/member/signup", {
      memberNick: "sneaky",
      memberPhone: "900000010",
      memberPassword: "secret-pass-1",
      memberType: "ADVISOR",
      memberPoints: 9999,
      memberStatus: "ACTIVE",
    });
    expect(res.status).toBe(201);
    expect(res.body.member.memberType).toBe("USER");
    expect(res.body.member.memberPoints).toBe(0);
    // blanked by the service: the hash never leaves the server
    expect(res.body.member.memberPassword ?? "").toBe("");
  });

  it.each([
    ["a short password", { memberPassword: "123" }, "Password must be 6 to 72 characters!"],
    ["a phone that isn't one", { memberPhone: "call me" }, "Please enter a valid phone number!"],
    ["a name over 30 characters", { memberNick: "x".repeat(31) }, "Your name must be 2 to 30 characters!"],
    ["a one-letter name", { memberNick: "x" }, "Your name must be 2 to 30 characters!"],
    ["an object instead of a name", { memberNick: { $gt: "" } }, "Please check your input and try again!"],
  ])("refuses %s", async (_label, override, message) => {
    const res = await post("/member/signup", {
      memberNick: "valid-name",
      memberPhone: "900000011",
      memberPassword: "secret-pass-1",
      ...override,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(message);
  });

  it("accepts a formatted Uzbek number", async () => {
    const res = await post("/member/signup", {
      memberNick: "formatted",
      memberPhone: "+998 90 123-45-67",
      memberPassword: "secret-pass-1",
    });
    expect(res.status).toBe(201);
  });

  it("refuses a nickname that is already taken", async () => {
    await signup(ctx.app, "taken");
    const res = await post("/member/signup", { memberNick: "taken", memberPhone: "900000012", memberPassword: "secret-pass-1" });
    expect(res.status).toBe(400);
  });
});

describe("login", () => {
  it("works with the right password", async () => {
    await signup(ctx.app, "loginuser", "right-pass-1");
    const res = await post("/member/login", { memberNick: "loginuser", memberPassword: "right-pass-1" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("refuses the wrong password", async () => {
    const res = await post("/member/login", { memberNick: "loginuser", memberPassword: "wrong-pass-1" });
    expect(res.status).toBe(401);
  });

  it("refuses a query operator in place of the nickname", async () => {
    const res = await post("/member/login", { memberNick: { $ne: null }, memberPassword: "right-pass-1" });
    expect(res.status).toBe(400);
  });
});

describe("tokens", () => {
  it("carry only the member id", async () => {
    const { token } = await signup(ctx.app, "tokenuser");
    expect(Object.keys(jwt.decode(token) as object).sort()).toEqual(["_id", "exp", "iat"]);
  });

  it("issued before the change (whole member inside) still work", async () => {
    const { memberId } = await signup(ctx.app, "olduser");
    const old = jwt.sign({ _id: memberId, memberNick: "olduser", memberType: "USER" }, TEST_JWT_SECRET, { expiresIn: "6h" });
    const res = await request(ctx.app).get("/member/detail").set("Authorization", `Bearer ${old}`);
    expect(res.status).toBe(200);
  });

  it.each([
    ["garbage", "not-a-token"],
    ["unsigned (alg: none)", `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${Buffer.from('{"_id":"6566f2c1e1b2c3d4e5f60718"}').toString("base64url")}.`],
    ["signed with another secret", jwt.sign({ _id: "6566f2c1e1b2c3d4e5f60718" }, "someone-elses-secret")],
    ["expired", jwt.sign({ _id: "6566f2c1e1b2c3d4e5f60718", exp: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET)],
  ])("refuses a %s token with a 401", async (_label, token) => {
    const res = await request(ctx.app).get("/member/detail").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe("profile update", () => {
  it("saves profile fields and ignores type, points and password", async () => {
    const { token } = await signup(ctx.app, "editor", "editor-pass-1");
    const res = await request(ctx.app)
      .post("/member/update")
      .set("Authorization", `Bearer ${token}`)
      .field("memberDesc", "loves toners")
      .field("memberType", "ADVISOR")
      .field("memberPoints", "9999")
      .field("memberPassword", "hijacked");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ memberDesc: "loves toners", memberType: "USER", memberPoints: 0 });

    const login = await post("/member/login", { memberNick: "editor", memberPassword: "editor-pass-1" });
    expect(login.status).toBe(200);
  });

  it("keeps the old name and phone when those fields come in blank", async () => {
    const { token } = await signup(ctx.app, "keeper");
    const res = await request(ctx.app)
      .post("/member/update")
      .set("Authorization", `Bearer ${token}`)
      .field("memberNick", "")
      .field("memberPhone", "");
    expect(res.body.memberNick).toBe("keeper");
    expect(res.body.memberPhone).toBeTruthy();
  });

  it("refuses an over-long description", async () => {
    const { token } = await signup(ctx.app, "talker");
    const res = await request(ctx.app)
      .post("/member/update")
      .set("Authorization", `Bearer ${token}`)
      .field("memberDesc", "x".repeat(501));
    expect(res.status).toBe(400);
  });
});

describe("admin", () => {
  it("only lets an advisor into the admin panel", async () => {
    const admin = await createAdmin(ctx.app);
    await signup(ctx.app, "shopper", "shopper-pass-1");

    const shopper = await request(ctx.app)
      .post("/admin/login")
      .type("form")
      .send({ memberNick: "shopper", memberPassword: "shopper-pass-1" });
    expect(shopper.status).not.toBe(302);

    const owner = await request(ctx.app)
      .post("/admin/login")
      .type("form")
      .send({ memberNick: "owner", memberPassword: "owner-pass-123" });
    expect(owner.status).toBe(302);
    expect(owner.headers.location).toBe("/admin");

    // and admin pages turn away anyone without that session
    const anonymous = await request(ctx.app).get("/admin/user/all");
    expect(anonymous.text).toContain("not authenticated");
    expect((await admin.get("/admin/user/all")).text).toContain("shopper");
  });

  it("refuses a second advisor signup", async () => {
    const res = await request(ctx.app)
      .post("/admin/signup")
      .field("memberNick", "owner2")
      .field("memberPhone", "900000002")
      .field("memberPassword", "owner-pass-123");
    expect(res.status).not.toBe(302);
  });

  it("blocks a member out on their very next request, and unblocks them", async () => {
    const admin = request.agent(ctx.app);
    await admin.post("/admin/login").type("form").send({ memberNick: "owner", memberPassword: "owner-pass-123" });
    const { token, memberId } = await signup(ctx.app, "blockme");
    const detail = () => request(ctx.app).get("/member/detail").set("Authorization", `Bearer ${token}`);

    expect((await detail()).status).toBe(200);
    await admin.post("/admin/user/edit").send({ _id: memberId, memberStatus: "BLOCK" }).expect(200);
    expect((await detail()).status).toBe(401);
    await admin.post("/admin/user/edit").send({ _id: memberId, memberStatus: "ACTIVE" }).expect(200);
    expect((await detail()).status).toBe(200);
  });
});

// Last: once tripped, the limiters block this IP for the rest of the file.
describe("rate limits", () => {
  it("block the shop login after 10 failed attempts", async () => {
    let res;
    for (let i = 0; i < 11; i++)
      res = await post("/member/login", { memberNick: "loginuser", memberPassword: `wrong-${i}-pass` });
    expect(res!.status).toBe(429);
    expect(res!.body.message).toBe("Too many attempts, please try again later!");
  });

  it("block the admin login after too many attempts", async () => {
    let res;
    for (let i = 0; i < 11; i++)
      res = await request(ctx.app).post("/admin/login").type("form").send({ memberNick: "owner", memberPassword: `wrong-${i}` });
    expect(res!.status).toBe(429);
    expect(res!.text).toContain("Too many attempts");
  });
});
