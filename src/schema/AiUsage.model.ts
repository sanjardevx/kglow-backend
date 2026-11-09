import mongoose, { Schema } from "mongoose";

/**
 * How many AI Beauty answers a member has had on one day (Uzbekistan time).
 * One document per member per day; the unique index is what makes the daily
 * limit hold even when two requests arrive at once. Old days delete
 * themselves.
 */
const aiUsageSchema = new Schema({
  memberId: { type: Schema.Types.ObjectId, required: true, ref: "Member" },
  day: { type: String, required: true }, // "2026-11-10"
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

aiUsageSchema.index({ memberId: 1, day: 1 }, { unique: true });
aiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<any>("AiUsage", aiUsageSchema);
