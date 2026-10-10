import mongoose, { Schema } from "mongoose";

const orderItemSchema = new Schema(
  {
    itemQuantity: {
      type: Number,
      required: true,
    },

    itemPrice: {
      type: Number,
      required: true,
    },

    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },

    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },
  },
  { timestamps: true, collection: "orderItems" },
);

// Every order list joins its lines by orderId; without this, each order in
// the list reads the whole orderItems collection.
orderItemSchema.index({ orderId: 1 });

export default mongoose.model("OrderItem", orderItemSchema);