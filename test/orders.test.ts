import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import OrderModel from "../src/schema/Order.model";
import OrderItemModel from "../src/schema/OrderItem.model";
import { addProduct, createAdmin, getProduct, PNG, placeOrder, signup, startTestApp, type TestApp } from "./helpers";

let ctx: TestApp;
let admin: TestAgent;
let token: string;

beforeAll(async () => {
  ctx = await startTestApp();
  admin = await createAdmin(ctx.app);
  ({ token } = await signup(ctx.app, "buyer"));
});
afterAll(async () => ctx.stop());

const decide = (orderId: string, orderStatus: string, rejectReason?: string) =>
  admin.post("/admin/order/update").send({ orderId, orderStatus, rejectReason });

describe("placing an order", () => {
  it("prices every line from the database, never from the basket", async () => {
    const product = await addProduct({ productPrice: 1000 });
    const res = await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 2, itemPrice: 1 }]);
    expect(res.status).toBe(201);
    expect(res.body.orderTotal).toBe(2000);
    expect(res.body.orderStatus).toBe("WAITING_CONFIRMATION");
  });

  it.each([
    ["a negative quantity", -5],
    ["a zero quantity", 0],
    ["a fractional quantity", 1.5],
    ["an absurd quantity", 1000],
    ["a quantity that isn't a number", "abc"],
  ])("refuses %s", async (_label, itemQuantity) => {
    const product = await addProduct();
    const res = await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Something is wrong with your basket, please refresh and try again!");
  });

  it.each([
    ["an empty basket", []],
    ["a query operator as product id", [{ productId: { $gt: "" }, itemQuantity: 1 }]],
    ["a basket that isn't JSON", "not json"],
  ])("refuses %s", async (_label, items) => {
    expect((await placeOrder(ctx.app, token, items)).status).toBe(400);
  });

  it("refuses an over-long delivery address", async () => {
    const product = await addProduct();
    const res = await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 1 }], { deliveryAddress: "x".repeat(301) });
    expect(res.status).toBe(400);
  });

  it("needs a signed-in shopper", async () => {
    const product = await addProduct();
    const res = await request(ctx.app).post("/order/create").field("items", JSON.stringify([{ productId: product._id, itemQuantity: 1 }]));
    expect(res.status).toBe(401);
  });

  it("refuses a payment proof that isn't an image", async () => {
    const product = await addProduct();
    const res = await request(ctx.app)
      .post("/order/create")
      .set("Authorization", `Bearer ${token}`)
      .field("items", JSON.stringify([{ productId: product._id, itemQuantity: 1 }]))
      .attach("paymentProof", Buffer.from("<h1>hi</h1>"), { filename: "page.html", contentType: "text/html" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Please upload an image (jpg, png, webp, avif or heic) under 10 MB!");
  });
});

describe("stock", () => {
  it("comes off when an order is placed", async () => {
    const product = await addProduct({ productLeftCount: 5 });
    await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 3 }]).expect(201);
    expect((await getProduct(product._id))!.productLeftCount).toBe(2);
  });

  it("can't be over-ordered, and a refused basket takes nothing at all", async () => {
    const plenty = await addProduct({ productLeftCount: 10 });
    const scarce = await addProduct({ productLeftCount: 1 });
    const res = await placeOrder(ctx.app, token, [
      { productId: plenty._id, itemQuantity: 2 },
      { productId: scarce._id, itemQuantity: 2 },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Sorry, there isn't enough stock left for one of the products!");
    expect((await getProduct(plenty._id))!.productLeftCount).toBe(10);
    expect((await getProduct(scarce._id))!.productLeftCount).toBe(1);
    expect(await OrderModel.countDocuments({ orderTotal: 0 })).toBe(0);
  });

  it("turns a product SOLD OUT when the last unit goes", async () => {
    const product = await addProduct({ productLeftCount: 2 });
    await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 2 }]).expect(201);
    const after = await getProduct(product._id);
    expect(after!.productLeftCount).toBe(0);
    expect(after!.productStatus).toBe("PAUSE");
  });

  it("can't be bought once a product is sold out", async () => {
    const product = await addProduct({ productStatus: "PAUSE", productLeftCount: 5 });
    const res = await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 1 }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("One of the products is no longer available!");
  });

  it("lets only one of several shoppers racing for the last unit win", async () => {
    const product = await addProduct({ productLeftCount: 1 });
    const shoppers = await Promise.all(["racer1", "racer2", "racer3", "racer4", "racer5"].map((nick) => signup(ctx.app, nick)));
    const results = await Promise.all(
      shoppers.map((s) => placeOrder(ctx.app, s.token, [{ productId: product._id, itemQuantity: 1 }])),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await getProduct(product._id))!.productLeftCount).toBe(0);
    expect(await OrderItemModel.countDocuments({ productId: product._id })).toBe(1);
  });
});

describe("the admin's decision", () => {
  it("on confirm, leaves stock as it is", async () => {
    const product = await addProduct({ productLeftCount: 5 });
    const order = (await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 2 }])).body;
    await decide(order._id, "CONFIRMED").expect(200);
    expect((await getProduct(product._id))!.productLeftCount).toBe(3);
  });

  it("on reject, puts the stock back and reopens a product that ran out", async () => {
    const product = await addProduct({ productLeftCount: 1 });
    const order = (await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 1 }])).body;
    expect((await getProduct(product._id))!.productStatus).toBe("PAUSE");

    const res = await decide(order._id, "REJECTED", "Payment never arrived");
    expect(res.status).toBe(200);
    expect(res.body.data.rejectReason).toBe("Payment never arrived");
    const after = await getProduct(product._id);
    expect(after!.productLeftCount).toBe(1);
    expect(after!.productStatus).toBe("PROCESS");
  });

  it("on reject, leaves a product the admin paused by hand paused", async () => {
    const product = await addProduct({ productLeftCount: 5 });
    const order = (await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 1 }])).body;
    await admin.post(`/admin/product/${product._id}`).send({ productStatus: "PAUSE" }).expect(200);

    await decide(order._id, "REJECTED", "Out of season").expect(200);
    const after = await getProduct(product._id);
    expect(after!.productLeftCount).toBe(5);
    expect(after!.productStatus).toBe("PAUSE");
  });

  it("can only be made once, so stock is never returned twice", async () => {
    const product = await addProduct({ productLeftCount: 5 });
    const order = (await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 2 }])).body;
    await decide(order._id, "REJECTED", "No payment").expect(200);
    expect((await decide(order._id, "REJECTED", "Again")).status).not.toBe(200);
    expect((await decide(order._id, "CONFIRMED")).status).not.toBe(200);
    expect((await getProduct(product._id))!.productLeftCount).toBe(5);
  });

  it("returns nothing for orders placed before stock was tracked", async () => {
    const product = await addProduct({ productLeftCount: 5 });
    const { memberId } = await signup(ctx.app, "legacy");
    const legacy = await OrderModel.create({ orderTotal: 10000, orderDelivery: 0, memberId });
    await OrderItemModel.create({ orderId: legacy._id, productId: product._id, itemQuantity: 3, itemPrice: 10000 });

    await decide(String(legacy._id), "REJECTED", "Old order").expect(200);
    expect((await getProduct(product._id))!.productLeftCount).toBe(5);
  });

  it.each([
    ["a status that isn't a decision", { orderStatus: "WAITING_CONFIRMATION" }],
    ["a rejection without a reason", { orderStatus: "REJECTED", rejectReason: "  " }],
    ["an order id that isn't one", { orderId: "nope", orderStatus: "CONFIRMED" }],
  ])("refuses %s", async (_label, body) => {
    const product = await addProduct();
    const order = (await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 1 }])).body;
    const res = await admin.post("/admin/order/update").send({ orderId: order._id, ...body });
    expect(res.status).toBe(400);
  });
});

describe("a shopper's own orders", () => {
  it("can be listed by status", async () => {
    const { token: own } = await signup(ctx.app, "lister");
    const product = await addProduct();
    await placeOrder(ctx.app, own, [{ productId: product._id, itemQuantity: 1 }]).expect(201);
    const res = await request(ctx.app).get("/order/all?page=1&limit=20&orderStatus=WAITING_CONFIRMATION").set("Authorization", `Bearer ${own}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("need a status to list", async () => {
    const res = await request(ctx.app).get("/order/all?page=1&limit=20").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it("can't be marked confirmed by the shopper — that endpoint is gone", async () => {
    const res = await request(ctx.app).post("/order/update").set("Authorization", `Bearer ${token}`).send({ orderStatus: "CONFIRMED" });
    expect(res.status).toBe(404);
  });
});

describe("payment screenshots", () => {
  it("are visible to the admin only", async () => {
    const product = await addProduct();
    const order = (await placeOrder(ctx.app, token, [{ productId: product._id, itemQuantity: 1 }])).body;
    const proof: string = order.paymentProof[0];
    expect(proof).toMatch(/^uploads\/orders\/[0-9a-f-]{36}\.png$/);

    expect((await request(ctx.app).get(`/${proof}`)).status).toBe(404);
    const anonymous = await request(ctx.app).get(`/admin/${proof}`);
    expect(anonymous.headers["content-type"]).not.toMatch(/^image\//);

    const res = await admin.get(`/admin/${proof}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(Buffer.compare(res.body, PNG)).toBe(0);

    expect((await admin.get("/admin/order/all")).text).toContain(`src="/admin/${proof}"`);
  });
});
