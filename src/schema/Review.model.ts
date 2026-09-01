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

export default mongoose.model("Review", reviewSchema);
