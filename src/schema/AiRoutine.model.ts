import mongoose, { Schema } from "mongoose";

/**
 * Each member's latest AI Beauty routine, so they can open it again from My
 * Page. Products are kept as ids and looked up fresh when it is read, so a
 * product that sold out or changed price since shows as it is now.
 */
const aiRoutineSchema = new Schema(
  {
    memberId: { type: Schema.Types.ObjectId, required: true, ref: "Member" },
    answers: { type: Schema.Types.Mixed, required: true },
    routine: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);

aiRoutineSchema.index({ memberId: 1 }, { unique: true });

export default mongoose.model<any>("AiRoutine", aiRoutineSchema);
