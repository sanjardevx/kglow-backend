import { describe, expect, it } from "vitest";
import { calculateOrderTotals } from "../src/libs/utils/orderTotals";

// The examples documented on calculateOrderTotals — the shopper types this
// total into their bank by hand, so every one of them must hold exactly.
describe("calculateOrderTotals", () => {
  it.each([
    [500000, 10, 50000, 450000],
    [246510, 10, 24651, 221859],
    [100005, 10, 10001, 90004],
    [440000, 0, 0, 440000],
  ])("%i at %i%% → %i off, %i to pay", (subtotal, percent, discount, total) => {
    const result = calculateOrderTotals(subtotal, percent);
    expect(result).toEqual({ subtotal, discountPercent: percent, discount, total });
    expect(result.subtotal - result.discount).toBe(result.total);
  });

  it.each([-5, NaN, Infinity])("treats a nonsense percent (%s) as no sale", (percent) => {
    expect(calculateOrderTotals(1000, percent).total).toBe(1000);
  });

  it("never discounts beyond 100%", () => {
    expect(calculateOrderTotals(1000, 150).total).toBe(0);
  });
});
