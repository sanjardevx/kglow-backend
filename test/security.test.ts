import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { addProduct, createAdmin, PNG, startTestApp, VERCEL_ORIGIN, type TestApp } from "./helpers";

let ctx: TestApp;
beforeAll(async () => {
  ctx = await startTestApp();
});
afterAll(async () => ctx.stop());

// There is only ever one advisor account, so the tests share its session.
let adminAgent: Awaited<ReturnType<typeof createAdmin>> | undefined;
const getAdmin = async () => (adminAgent ??= await createAdmin(ctx.app));

describe("headers", () => {
  it("lets the Vercel shop call the API and show its images", async () => {
    const res = await request(ctx.app).get("/product/all").set("Origin", VERCEL_ORIGIN);
    expect(res.headers["access-control-allow-origin"]).toBe(VERCEL_ORIGIN);
    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("does not grant CORS to other sites", async () => {
    const res = await request(ctx.app).get("/product/all").set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends HSTS and hides the framework", async () => {
    const res = await request(ctx.app).get("/product/all");
    expect(res.headers["strict-transport-security"]).toMatch(/max-age=\d+/);
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("protects admin pages with a CSP that still works over local http", async () => {
    const csp = (await request(ctx.app).get("/admin/login")).headers["content-security-policy"];
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("routes", () => {
  it("reports healthy while the database is up", async () => {
    const res = await request(ctx.app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("no longer has the debug check-me page", async () => {
    expect((await request(ctx.app).get("/admin/check-me")).status).toBe(404);
  });
});

describe("uploads", () => {
  it("serves product images publicly, with nosniff and a safe extension", async () => {
    const admin = await getAdmin();
    const created = await admin
      .post("/admin/product/create")
      .field("productBrand", "Brand")
      .field("productCategory", "SKINCARE")
      .field("productName", "Toner")
      .field("productPrice", "100000")
      .field("productVolume", "150ml")
      .field("productLeftCount", "5")
      // The name claims HTML; the content type says PNG — the saved name follows the type.
      .attach("productImages", PNG, { filename: "evil.html", contentType: "image/png" });
    expect(created.headers.location).toBe("/admin/product/all");

    const [product] = (await request(ctx.app).get("/product/all")).body;
    const image: string = product.productImages[0];
    expect(image).toMatch(/^uploads\/products\/[0-9a-f-]{36}\.png$/);

    const res = await request(ctx.app).get(`/${image}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("serves the catalog photos that ship with the code", async () => {
    // seed/uploads holds the catalog's photos; uploads/ (empty here) is
    // checked first, so admin uploads always win.
    const res = await request(ctx.app).get(
      "/uploads/products/6aad6462090d1858db1fc011-1.jpg",
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/jpeg");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect((await request(ctx.app).get("/uploads/products/missing.jpg")).status).toBe(404);
  });

  it("still keeps payment proofs out of the open folders", async () => {
    expect((await request(ctx.app).get("/uploads/orders/anything.png")).status).toBe(404);
  });
});

describe("admin products page", () => {
  it("lists the whole catalog on one page, ready for search and filters", async () => {
    for (let i = 0; i < 25; i++) await addProduct({ productName: `Listed ${i}` });
    const admin = await getAdmin();
    const res = await admin.get("/admin/product/all").expect(200);
    const rows = res.text.match(/class="pf-row"/g) ?? [];
    expect(rows.length).toBeGreaterThanOrEqual(25); // more than the old 20 a page
    expect(res.text).toContain('id="pf-q"');
    expect(res.text).not.toContain('class="pager"');
  });
});
