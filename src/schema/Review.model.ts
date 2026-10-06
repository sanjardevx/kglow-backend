import mongoose, { Schema } from "mongoose";
import { ReviewStatus } from "../libs/enums/review.enum";

// Reviews are text-only — the admin collects them over Telegram/DM
// and types them in by hand. There is no customer-facing review form.

const reviewSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    reviewerName: {
      type: String,
      required: true,
    },

    reviewText: {
      type: String,
      required: true,
    },

    reviewStars: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      default: 5,
    },

    reviewStatus: {
      type: String,
      enum: ReviewStatus,
      default: ReviewStatus.ACTIVE,
    },
  },
  { timestamps: true },
);

// Untyped on purpose: mongoose 6.13 infers document types the services'
// interfaces don't match yet (their ObjectId is the schema type). Kept as
// loose as 6.2 was until those interfaces are corrected.
export default mongoose.model<any>("Review", reviewSchema);
