import mongoose, { Schema } from "mongoose";
import { ProductCategory, ProductStatus } from "../libs/enums/product.enum";

const productSchema = new Schema(
  {
    productStatus: {
      type: String,
      enum: ProductStatus,
      default: ProductStatus.PROCESS,
    },

    productBrand: {
      type: String,
      required: true,
    },

    productCategory: {
      type: String,
      enum: ProductCategory,
      required: true,
    },

    productName: {
      type: String,
      required: true,
    },

    productPrice: {
      type: Number,
      required: true,
    },

    productVolume: {
      type: String,
      required: true,
    },

    productLeftCount: {
      type: Number,
      required: true,
    },

    productDesc: {
      type: String,
    },

    productHowToUse: {
      type: String,
    },

    productSuitableFor: {
      type: String,
    },

    productImages: {
      type: [String],
      default: [],
    },

    productViews: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

productSchema.index(
  { productBrand: 1, productName: 1, productVolume: 1 },
  { unique: true },
);
// Untyped on purpose: mongoose 6.13 infers document types the services'
// interfaces don't match yet (their ObjectId is the schema type). Kept as
// loose as 6.2 was until those interfaces are corrected.
export default mongoose.model<any>("Product", productSchema);