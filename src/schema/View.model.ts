import mongoose, { Schema } from "mongoose";
import { ViewGroup } from "../libs/enums/view.enum";

const viewSchema = new Schema(
  {
    viewGroup: {
      type: String,
      enum: ViewGroup,
      required: true,
    },

    memberId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Member",
    },

    viewRefId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true },
);

// Untyped on purpose: mongoose 6.13 infers document types the services'
// interfaces don't match yet (their ObjectId is the schema type). Kept as
// loose as 6.2 was until those interfaces are corrected.
export default mongoose.model<any>("View", viewSchema);
