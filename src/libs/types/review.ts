import { ObjectId } from "mongoose";
import { ReviewStatus } from "../enums/review.enum";
import { Product } from "./product";

export interface Review {
  _id: ObjectId;
  productId: ObjectId;
  reviewerName: string;
  reviewText: string;
  reviewStars: number;
  reviewStatus: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
  //** from aggregation ** //
  productData: Product[];
}

export interface ReviewInput {
  productId: ObjectId;
  reviewerName: string;
  reviewText: string;
  reviewStars: number;
  reviewStatus?: ReviewStatus;
}

export interface ReviewUpdateInput {
  _id?: ObjectId;
  productId?: ObjectId;
  reviewerName?: string;
  reviewText?: string;
  reviewStars?: number;
  reviewStatus?: ReviewStatus;
}
