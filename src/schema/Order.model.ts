import mongoose, { Schema } from "mongoose";
import { OrderStatus } from "../libs/enums/order.enum";

const orderSchema = new Schema(
  {
    /**
     * Stored together: subtotal - discount + delivery = total. Keeping only
     * the total leaves an order unexplainable once the percentage changes,
     * and the admin reconciles these against a bank transfer.
     */
    orderSubtotal: {
      type: Number,
      default: 0,
    },

    /** What was running when the order was placed, not what runs today. */
    orderDiscountPercent: {
      type: Number,
      default: 0,
    },

    orderDiscount: {
      type: Number,
      default: 0,
    },

    orderTotal: {
      type: Number,
      required: true,
    },

    orderDelivery: {
      type: Number,
      required: true,
    },

    orderStatus: {
      type: String,
      enum: OrderStatus,
      default: OrderStatus.WAITING_CONFIRMATION,
    },

    deliveryAddress: {
      type: String,
    },

    paymentProof: {
      type: [String],
    },

    transferNote: {
      type: String,
    },

    // Written by the admin when rejecting, and shown to the shopper on the
    // order itself — otherwise a rejection arrives with no explanation.
    rejectReason: {
      type: String,
    },

    memberId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "Member",
    },
  },
  { timestamps: true, collection: "orders" },
);

// Untyped on purpose: mongoose 6.13 infers document types the services'
// interfaces don't match yet (their ObjectId is the schema type). Kept as
// loose as 6.2 was until those interfaces are corrected.
export default mongoose.model<any>("Order", orderSchema);
