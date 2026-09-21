import mongoose, { Schema } from "mongoose";

/**
 * The shop's current sale — one document, not a collection of campaigns.
 *
 * A shop this size runs one sale at a time (Navruz, New Year, 8 March), so a
 * single row the admin edits is the whole feature. Percentages and dates live
 * here rather than in the code because a sale that needs a deploy to start or
 * stop is a sale nobody runs.
 */
const discountSchema = new Schema(
  {
    /** 0-100. Applied to the basket subtotal, never per product. */
    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    /** The switch. Off means no sale, whatever the percentage says. */
    discountIsActive: {
      type: Boolean,
      default: false,
    },

    /**
     * Optional last day, as a plain "YYYY-MM-DD" calendar date — not a
     * timestamp. The sale still applies all through this day in Tashkent.
     * Empty means it runs until the admin switches it off.
     */
    discountEndsOn: {
      type: String,
      default: "",
    },

    /** Shown on the storefront banner, e.g. "Autumn Sale". */
    discountLabel: {
      type: String,
      default: "",
    },
  },
  { timestamps: true, collection: "discount" },
);

export default mongoose.model("Discount", discountSchema);
