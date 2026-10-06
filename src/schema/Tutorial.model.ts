import mongoose, { Schema } from "mongoose";
import { TutorialPlatform, TutorialStatus } from "../libs/enums/tutorial.enum";

// Videos are never uploaded to this server — only a YouTube/Instagram link is
// stored, and the platform + embed id are derived from it once at creation
// time (see libs/utils/tutorialLink.ts) so the SPA can embed the original
// player directly. tutorialThumbnail is best-effort: YouTube's public oEmbed
// fills it in, Instagram has none (its oEmbed needs a Meta app token we don't
// have), so the admin grid falls back to the live embed for those.

const tutorialSchema = new Schema(
  {
    tutorialTitle: {
      type: String,
      required: true,
    },

    tutorialPlatform: {
      type: String,
      enum: TutorialPlatform,
      required: true,
    },

    tutorialUrl: {
      type: String,
      required: true,
    },

    tutorialEmbedId: {
      type: String,
      required: true,
    },

    tutorialThumbnail: {
      type: String,
    },

    // What the video is selling. The brand is always set and is what the
    // storefront falls back to, because it survives the product it refers
    // to going out of stock, being deleted, or never having been stocked in
    // the first place (a creator may feature an item we don't carry).
    // tutorialProductId is the precise version, set only when the admin
    // knows exactly which item is on screen.
    tutorialBrand: {
      type: String,
      required: true,
    },

    tutorialProductId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },

    tutorialStatus: {
      type: String,
      enum: TutorialStatus,
      default: TutorialStatus.ACTIVE,
    },

    tutorialViews: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

// Untyped on purpose: mongoose 6.13 infers document types the services'
// interfaces don't match yet (their ObjectId is the schema type). Kept as
// loose as 6.2 was until those interfaces are corrected.
export default mongoose.model<any>("Tutorial", tutorialSchema);
