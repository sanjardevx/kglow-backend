import { ObjectId } from "mongoose";
import { OrderStatus } from "../enums/order.enum";
import { Product } from "./product";
import { Member } from "./member";

export interface OrderItem {
  _id: ObjectId;
  itemQuantity: number;
  itemPrice: number;
  orderId: ObjectId;
  productId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  _id: ObjectId;
  orderSubtotal: number;
  orderDiscountPercent: number;
  orderDiscount: number;
  orderTotal: number;
  orderDelivery: number;
  orderStatus: OrderStatus;
  deliveryAddress?: string;
  paymentProof?: string[];
  transferNote?: string;
  rejectReason?: string;
  memberId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  //** from aggregation ** //
  orderItems: OrderItem[];
  productData: Product[];
  memberData: Member[];
}

export interface OrderItemInput {
  itemQuantity: number;
  itemPrice: number;
  orderId?: ObjectId;
  productId?: ObjectId;
}

/** What the basket sends per line — the price is looked up, never taken. */
export interface OrderItemRequest {
  productId: string;
  itemQuantity: number;
}

export interface OrderCreateInput {
  items: OrderItemRequest[];
  deliveryAddress?: string;
  transferNote?: string;
  paymentProof?: string[];
}

export interface OrderInquiry {
  page: number;
  limit: number;
  orderStatus: OrderStatus;
}

