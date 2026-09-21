import { ObjectId } from "mongoose";

export interface Discount {
  _id: ObjectId;
  discountPercent: number;
  discountIsActive: boolean;
  discountEndsOn: string;
  discountLabel: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiscountUpdateInput {
  discountPercent: number;
  discountIsActive: boolean;
  discountEndsOn?: string;
  discountLabel?: string;
}

/** What the storefront is told: the rule, never the switch behind it. */
export interface ActiveDiscount {
  percent: number;
  label: string;
  endsOn: string;
}
