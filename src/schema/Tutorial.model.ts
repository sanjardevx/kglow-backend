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

    tutorialDescription: {
      type: String,
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

    tutorialCategory: {
      type: String,
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

export default mongoose.model("Tutorial", tutorialSchema);
