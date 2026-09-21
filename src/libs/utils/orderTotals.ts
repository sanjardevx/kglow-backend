interface OrderTotals {
  subtotal: number;
  discountPercent: number;
  discount: number;
  total: number;
}

/**
 * Turns a basket subtotal into the numbers an order is stored with.
 *
 * The discount comes off the subtotal once, not line by line: rounding per
 * line drifts — two lines of 123,255 lose 24,652 where the basket as a whole
 * loses 24,651 — and the shopper types this total into their bank by hand.
 * Rounding the discount rather than the total keeps
 * `subtotal - discount === total` exactly true, so the lines on screen add up.
 *
 * Mirrored in k-glow-react/src/lib/orderTotals.ts; change one, change both.
 *   (500000, 10) -> 50000 off, 450000     (246510, 10) -> 24651 off, 221859
 *   (100005, 10) -> 10001 off,  90004     (440000,  0) ->     0 off, 440000
 */
export function calculateOrderTotals(
  subtotal: number,
  discountPercent: number,
): OrderTotals {
  const percent =
    Number.isFinite(discountPercent) && discountPercent > 0
      ? Math.min(discountPercent, 100)
      : 0;
  const discount = Math.round((subtotal * percent) / 100);

  return { subtotal, discountPercent: percent, discount, total: subtotal - discount };
}
