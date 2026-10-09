import fs from "fs";
import os from "os";
import path from "path";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import type { Express } from "express";
import ProductModel from "../src/schema/Product.model";
import { ProductCategory, ProductStatus } from "../src/libs/enums/product.enum";

export const TEST_JWT_SECRET = "test-jwt-secret-0123456789";
export const VERCEL_ORIGIN = "https://k-glow-react.vercel.app";

// 1x1 transparent PNG
export const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export interface TestApp {
  app: Express;
  stop: () => Promise<void>;
}

/**
 * A fresh database and a fresh app for one test file. A replica set rather
 * than a single server, because placing and deciding orders runs inside
 * transactions — exactly as on Atlas.
 */
export async function startTestApp(): Promise<TestApp> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  const uri = replSet.getUri("kglow_test");

  // Uploads are written relative to the working directory; keep them out of
  // the project's own uploads/ folder.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "kglow-test-"));
  process.chdir(workDir);

  // app.ts reads these when it is imported, so they go in first.
  Object.assign(process.env, {
    MONGO_URL: uri,
    SESSION_SECRET: "test-session-secret",
    SECTER_TOKEN: TEST_JWT_SECRET,
    CORS_ORIGINS: VERCEL_ORIGIN,
  });

  mongoose.set("strictQuery", true); // as server.ts does
  await mongoose.connect(uri);
  const { default: app } = await import("../src/app");

  return {
    app,
    stop: async () => {
      await mongoose.disconnect();
      await replSet.stop();
      fs.rmSync(workDir, { recursive: true, force: true });
    },
  };
}

let phoneCounter = 900000100;

export async function signup(
  app: Express,
  memberNick: string,
  memberPassword = "secret-pass-1",
): Promise<{ token: string; memberId: string }> {
  const res = await request(app)
    .post("/member/signup")
    .send({ memberNick, memberPhone: String(phoneCounter++), memberPassword });
  if (res.status !== 201) throw new Error(`signup failed: ${res.status} ${res.text}`);
  return { token: res.body.accessToken, memberId: res.body.member._id };
}

/** The one advisor account, signed in — returns an agent carrying its session. */
export async function createAdmin(app: Express) {
  const agent = request.agent(app);
  const res = await agent
    .post("/admin/signup")
    .field("memberNick", "owner")
    .field("memberPhone", "900000001")
    .field("memberPassword", "owner-pass-123");
  if (res.status !== 302) throw new Error(`admin signup failed: ${res.status}`);
  return agent;
}

export async function addProduct(overrides: Record<string, unknown> = {}) {
  const product = await ProductModel.create({
    productStatus: ProductStatus.PROCESS,
    productBrand: "Brand",
    productCategory: ProductCategory.SKINCARE,
    productName: `Product ${Math.random().toString(36).slice(2, 8)}`,
    productPrice: 10000,
    productVolume: "100ml",
    productLeftCount: 10,
    productImages: ["uploads/products/test.png"],
    ...overrides,
  });
  return product;
}

export async function getProduct(id: unknown) {
  return ProductModel.findById(id).lean();
}

export function placeOrder(
  app: Express,
  token: string,
  items: unknown,
  extra: Record<string, string> = {},
) {
  let req = request(app)
    .post("/order/create")
    .set("Authorization", `Bearer ${token}`)
    .field("items", typeof items === "string" ? items : JSON.stringify(items))
    .field("deliveryAddress", extra.deliveryAddress ?? "Tashkent");
  for (const [key, value] of Object.entries(extra))
    if (key !== "deliveryAddress") req = req.field(key, value);
  return req.attach("paymentProof", PNG, { filename: "proof.png", contentType: "image/png" });
}
