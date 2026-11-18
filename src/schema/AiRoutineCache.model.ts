import mongoose, { Schema } from "mongoose";

/**
 * Finished AI Beauty routines, kept by quiz answers. The quiz has a fixed
 * set of answers, so shoppers often give the same ones; they get the stored
 * routine at once instead of a new paid answer.
 *
 * The key also covers the catalog the routine was built from, so when a
 * product is added, sells out or changes, the old routines simply stop
 * matching. Unused entries delete themselves after a week.
 */
const aiRoutineCacheSchema = new Schema({
  key: { type: String, required: true },
  routine: { type: Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true },
});

aiRoutineCacheSchema.index({ key: 1 }, { unique: true });
aiRoutineCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<any>("AiRoutineCache", aiRoutineCacheSchema);
