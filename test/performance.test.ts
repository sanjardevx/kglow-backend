import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import OrderModel from "../src/schema/Order.model";
import OrderItemModel from "../src/schema/OrderItem.model";
import ViewModel from "../src/schema/View.model";
import ProductModel from "../src/schema/Product.model";
import { createAdmin, PNG, startTestApp, type TestApp } from "./helpers";

let ctx: TestApp;
beforeAll(async () => {
  ctx = await startTestApp();
  await Promise.all([OrderModel.init(), OrderItemModel.init(), ViewModel.init()]);
});
afterAll(async () => ctx.stop());

/** What MongoDB says it will do: walk an index, or read every document. */
async function planOf(query: { explain: (verbosity: string) => Promise<unknown> }) {
  const explained = await query.explain("queryPlanner");
  const result = (Array.isArray(explained) ? explained[0] : explained) as {
    queryPlanner: { winningPlan: unknown };
  };
  return JSON.stringify(result.queryPlanner.winningPlan);
}

describe("indexes", () => {
  const member = new mongoose.Types.ObjectId();

  it("find a shopper's orders of one status, already newest first", async () => {
    const plan = await planOf(
      OrderModel.find({ memberId: member, orderStatus: "CONFIRMED" }).sort({ createdAt: -1 }),
    );
    expect(plan).toContain("IXSCAN");
    expect(plan).not.toContain("COLLSCAN");
    expect(plan).not.toContain('"stage":"SORT"'); // no sorting in memory
  });

  it("sort the admin's order list without reading everything into memory", async () => {
    const plan = await planOf(OrderModel.find({}).sort({ createdAt: -1 }));
    expect(plan).toContain("IXSCAN");
    expect(plan).not.toContain('"stage":"SORT"');
  });

  it("count the orders waiting for a decision without reading them all", async () => {
    const plan = await planOf(
      OrderModel.find({ orderStatus: "WAITING_CONFIRMATION" }).sort({ createdAt: 1 }),
    );
    expect(plan).toContain("IXSCAN");
    expect(plan).not.toContain("COLLSCAN");
    expect(plan).not.toContain('"stage":"SORT"');
  });

  it("find an order's lines without scanning every line ever sold", async () => {
    const plan = await planOf(OrderItemModel.find({ orderId: new mongoose.Types.ObjectId() }));
    expect(plan).toContain("IXSCAN");
    expect(plan).not.toContain("COLLSCAN");
  });

  it("check 'seen this product before?' without scanning every view", async () => {
    const plan = await planOf(
      ViewModel.findOne({ memberId: member, viewRefId: new mongoose.Types.ObjectId() }),
    );
    expect(plan).toContain("IXSCAN");
    expect(plan).not.toContain("COLLSCAN");
  });
});

describe("compression", () => {
  it("gzips product lists", async () => {
    await ProductModel.insertMany(
      Array.from({ length: 30 }, (_, i) => ({
        productBrand: "Brand",
        productCategory: "SKINCARE",
        productName: `Toner ${i}`,
        productPrice: 1000,
        productVolume: "100ml",
        productLeftCount: 5,
        productDesc: "A gentle daily toner for every skin type. ".repeat(5),
      })),
    );
    const res = await request(ctx.app).get("/product/all?limit=30").set("Accept-Encoding", "gzip");
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBe("gzip");
    expect(res.body).toHaveLength(30); // still the same data once unpacked
  });
});

describe("caching", () => {
  it("lets browsers keep uploaded images for good", async () => {
    const admin = await createAdmin(ctx.app);
    await admin
      .post("/admin/product/create")
      .field("productBrand", "Cached")
      .field("productCategory", "SKINCARE")
      .field("productName", "Serum")
      .field("productPrice", "1000")
      .field("productVolume", "30ml")
      .field("productLeftCount", "5")
      .attach("productImages", PNG, { filename: "serum.png", contentType: "image/png" });
    const product = await ProductModel.findOne({ productBrand: "Cached" }).lean();

    const res = await request(ctx.app).get(`/${product!.productImages[0]}`).set("Accept-Encoding", "gzip");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(res.headers["content-encoding"]).toBeUndefined(); // already compressed; not gzipped again
  });

  it("does not freeze the admin panel's own CSS, which changes on deploy", async () => {
    const res = await request(ctx.app).get("/css/main.css");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).not.toContain("immutable");
  });
});
