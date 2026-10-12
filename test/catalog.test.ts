import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import ProductModel from "../src/schema/Product.model";
import { addProduct, getProduct, signup, startTestApp, type TestApp } from "./helpers";

let ctx: TestApp;
const get = (path: string) => request(ctx.app).get(path);

beforeAll(async () => {
  ctx = await startTestApp();
  await ProductModel.insertMany(
    Array.from({ length: 105 }, (_, i) => ({
      productBrand: i % 2 ? "Missha" : "Cosrx",
      productCategory: i % 3 ? "SKINCARE" : "MAKEUP",
      productName: `Toner ${i}`,
      productPrice: 1000 * (i + 1),
      productVolume: "100ml",
      productLeftCount: 5,
    })),
  );
  await addProduct({ productName: "Gone", productStatus: "DELETE" });
});
afterAll(async () => ctx.stop());

describe("product list", () => {
  it("works with no parameters at all (it used to crash)", async () => {
    const res = await get("/product/all");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(10);
  });

  it("caps an oversized page at 100", async () => {
    expect((await get("/product/all?page=1&limit=100000")).body).toHaveLength(100);
  });

  it("still gives the shop its 100 per page", async () => {
    expect((await get("/product/all?page=1&limit=100&order=createdAt")).body).toHaveLength(100);
  });

  it("pages through the rest", async () => {
    expect((await get("/product/all?page=2&limit=100&order=createdAt")).body).toHaveLength(5);
  });

  it("never shows deleted products", async () => {
    const all = (await get("/product/all?page=1&limit=100&search=gone")).body;
    expect(all).toHaveLength(0);
  });

  it("sorts by price, cheapest first", async () => {
    const res = await get("/product/all?page=1&limit=3&order=productPrice");
    expect(res.body.map((p: { productPrice: number }) => p.productPrice)).toEqual([1000, 2000, 3000]);
  });

  it("falls back to newest first for an unknown sort", async () => {
    const res = await get("/product/all?page=1&limit=5&order=__proto__");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
  });

  it("filters by category and refuses one that doesn't exist", async () => {
    const makeup = (await get("/product/all?page=1&limit=100&productCategory=MAKEUP")).body;
    expect(makeup.length).toBeGreaterThan(0);
    expect(makeup.every((p: { productCategory: string }) => p.productCategory === "MAKEUP")).toBe(true);
    expect((await get("/product/all?productCategory=WEAPONS")).status).toBe(400);
  });

  it.each(["abc", "-1", "0"])("refuses page=%s", async (page) => {
    expect((await get(`/product/all?page=${page}`)).status).toBe(400);
  });
});

describe("catalog stats", () => {
  it("counts what the shop shows, and each brand once", async () => {
    const res = await get("/product/stats").expect(200);
    // 105 seeded, the deleted one left out; Missha and Cosrx.
    expect(res.body).toEqual({ productCount: 105, brandCount: 2 });
  });
});

describe("search", () => {
  it("matches name or brand, ignoring case", async () => {
    const byName = (await get("/product/all?page=1&limit=100&search=toner%2010")).body;
    expect(byName.map((p: { productName: string }) => p.productName)).toContain("Toner 10");
    const byBrand = (await get("/product/all?page=1&limit=100&search=MISSHA")).body;
    expect(byBrand.length).toBeGreaterThan(0);
  });

  it("treats typed text literally", async () => {
    expect((await get("/product/all?page=1&limit=100&search=.")).body).toHaveLength(0);
    expect((await get(`/product/all?search=${encodeURIComponent("[")}`)).status).toBe(200);
  });

  it("shrugs off a pattern built to stall the database", async () => {
    const started = Date.now();
    const res = await get(`/product/all?search=${encodeURIComponent("(a+)+$")}`);
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("refuses a search over 50 characters", async () => {
    expect((await get(`/product/all?search=${"a".repeat(51)}`)).status).toBe(400);
  });
});

describe("single items", () => {
  it.each([
    "/product/not-an-id",
    "/product/0123456789abcdef01234567",
    "/review/product/xyz",
    "/tutorial/zzz",
  ])("%s is a 404, not a crash", async (path) => {
    expect((await get(path)).status).toBe(404);
  });

  it("counts one view per signed-in member, however often they look", async () => {
    const product = await addProduct();
    const { token } = await signup(ctx.app, "viewer");
    for (let i = 0; i < 3; i++)
      await get(`/product/${product._id}`).set("Authorization", `Bearer ${token}`).expect(200);
    await get(`/product/${product._id}`).expect(200); // anonymous views don't count
    expect((await getProduct(product._id))!.productViews).toBe(1);
  });
});

describe("other lists", () => {
  it.each(["/review/all?limit=6", "/tutorial/all?page=1&limit=24", "/discount/active", "/member/top-users"])(
    "%s works",
    async (path) => {
      expect((await get(path)).status).toBe(200);
    },
  );

  it("refuses a limit that isn't a number", async () => {
    expect((await get("/review/all?limit=abc")).status).toBe(400);
  });
});
