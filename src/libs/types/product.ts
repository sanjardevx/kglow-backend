import { ObjectId } from "mongoose";
import { ProductCategory, ProductStatus } from "../enums/product.enum";

export interface Product {
  _id: ObjectId;
  productStatus: ProductStatus;
  productBrand: string;
  productCategory: ProductCategory;
  productName: string;
  productPrice: number;
  productVolume: string;
  productLeftCount: number;
  productDesc?: string;
  productHowToUse?: string;
  productSuitableFor?: string;
  productImages: string[];
  productViews: number;
}

export interface ProductInquiry {
  order: string;
  page: number;
  limit: number;
  productCategory?: ProductCategory;
  search?: string;
}

export interface ProductInput {
  productStatus?: ProductStatus;
  productBrand: string;
  productCategory: ProductCategory;
  productName: string;
  productPrice: number;
  productVolume?: string;
  productLeftCount: number;
  productDesc?: string;
  productHowToUse?: string;
  productSuitableFor?: string;
  productImages?: string[];
  productViews?: number;
}

export interface ProductUpdateInput {
  _id: ObjectId;
  productStatus?: ProductStatus;
  productBrand?: string;
  productCategory?: ProductCategory;
  productName?: string;
  productPrice?: number;
  productVolume?: string;
  productLeftCount?: number;
  productDesc?: string;
  productHowToUse?: string;
  productSuitableFor?: string;
  productImages?: string[];
  productViews?: number;
}