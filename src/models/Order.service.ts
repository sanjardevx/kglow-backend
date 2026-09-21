import { shapeIntoMongooseObjectId } from "./../libs/config";
import OrderItemModel from "../schema/OrderItem.model";
import OrderModel from "../schema/Order.model";
import { Member } from "../libs/types/member";
import {
  Order,
  OrderCreateInput,
  OrderInquiry,
  OrderItemInput,
  OrderUpdateInput,
} from "../libs/types/order";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { ObjectId } from "mongoose";
import { OrderStatus } from "../libs/enums/order.enum";
import { ProductStatus } from "../libs/enums/product.enum";
import ProductModel from "../schema/Product.model";
import MemberService from "./Member.service";
import DiscountService from "./Discount.service";
import { calculateOrderTotals } from "../libs/utils/orderTotals";

class OrderService {
  private readonly orderModel;
  private readonly orderItemModel;
  private readonly productModel;
  private readonly memberService;
  private readonly discountService;

  constructor() {
    this.orderModel = OrderModel;
    this.orderItemModel = OrderItemModel;
    this.productModel = ProductModel;
    this.memberService = new MemberService();
    this.discountService = new DiscountService();
  }

  public async createOrder(
    member: Member,
    input: OrderCreateInput,
  ): Promise<Order> {
    const memberId = shapeIntoMongooseObjectId(member._id);

    // Priced from the database, never from the request: the basket posts the
    // prices it displayed, and a page anyone can edit can post anything —
    // setting both the amount owed and the subtotal the sale is taken from.
    // Outside the try below so a rejected item keeps its own message.
    const pricedItems = await this.priceItems(input.items);
    const subtotal = pricedItems.reduce(
      (sum: number, item: OrderItemInput) =>
        sum + item.itemPrice * item.itemQuantity,
      0,
    );

    const discountPercent = await this.discountService.getActivePercent();
    const totals = calculateOrderTotals(subtotal, discountPercent);

    try {
      const newOrder: Order = await this.orderModel.create({
        orderSubtotal: totals.subtotal,
        orderDiscountPercent: totals.discountPercent,
        orderDiscount: totals.discount,
        // Never part of what the shopper transfers: free above the threshold,
        // and paid to the courier on pickup below it.
        orderDelivery: 0,
        orderTotal: totals.total,
        memberId: memberId,
        deliveryAddress: input.deliveryAddress,
        transferNote: input.transferNote,
        paymentProof: input.paymentProof,
      });

      const orderId = newOrder._id;
      console.log("orderId:", newOrder._id);
      await this.recordOrderItems(orderId, pricedItems);
      return newOrder;
    } catch (err) {
      console.log("Error, model:createOrder:", err);
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
  }

  /**
   * A product deleted since it was added to the basket stops the whole order
   * rather than being dropped or priced at zero — the shopper is about to
   * transfer money against this total by hand.
   */
  private async priceItems(
    items: OrderItemInput[],
  ): Promise<OrderItemInput[]> {
    if (!items?.length)
      throw new Errors(HttpCode.BAD_REQUEST, Message.PRODUCT_UNAVAILABLE);

    const productIds = items.map((item) => {
      if (!item.productId)
        throw new Errors(HttpCode.BAD_REQUEST, Message.PRODUCT_UNAVAILABLE);
      return shapeIntoMongooseObjectId(item.productId);
    });

    const products = await this.productModel
      .find({
        _id: { $in: productIds },
        productStatus: { $ne: ProductStatus.DELETE },
      })
      .exec();

    const priceById = new Map(
      products.map((product) => [String(product._id), product.productPrice]),
    );

    return items.map((item) => {
      const price = priceById.get(String(item.productId));
      if (price === undefined)
        throw new Errors(HttpCode.BAD_REQUEST, Message.PRODUCT_UNAVAILABLE);

      return { ...item, itemPrice: price };
    });
  }

  private async recordOrderItems(
    orderId: ObjectId,
    input: OrderItemInput[],
  ): Promise<void> {
    const promisedList = input.map(async (item: OrderItemInput) => {
      item.orderId = orderId;
      item.productId = shapeIntoMongooseObjectId(item.productId);
      await this.orderItemModel.create(item);
      return "INSERTED";
    });

    const orderItemsState = await Promise.all(promisedList);
    console.log("orderItemsState:", orderItemsState);
  }

  public async getMyOrders(
    member: Member,
    inquiry: OrderInquiry,
  ): Promise<Order[]> {
    const memberId = shapeIntoMongooseObjectId(member._id);
    const matches = { memberId: memberId, orderStatus: inquiry.orderStatus };

    const result = await this.orderModel
      .aggregate([
        { $match: matches },
        { $sort: { createdAt: -1 } },
        { $skip: (inquiry.page - 1) * inquiry.limit },
        { $limit: inquiry.limit },
        {
          $lookup: {
            from: "orderItems",
            localField: "_id",
            foreignField: "orderId",
            as: "orderItems",
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "orderItems.productId",
            foreignField: "_id",
            as: "productData",
          },
        },
      ])
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }

  public async updateOrder(
    member: Member,
    input: OrderUpdateInput,
  ): Promise<Order> {
    const memberId = shapeIntoMongooseObjectId(member._id),
      orderId = shapeIntoMongooseObjectId(input.orderId),
      orderStatus = input.orderStatus;

    const result = await this.orderModel
      .findByIdAndUpdate(
        {
          memberId: memberId,
          _id: orderId,
        },
        { orderStatus: orderStatus },
        { new: true },
      )
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);

    // order status WAITING_CONFIRMATION => CONFIRMED (give point)
    if (orderStatus === OrderStatus.CONFIRMED) {
      await this.memberService.addUserPoint(member, 1);
    }
    return result;
  }

  public async getAllOrders(): Promise<Order[]> {
    const result = await this.orderModel
      .aggregate([
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "orderItems",
            localField: "_id",
            foreignField: "orderId",
            as: "orderItems",
          },
        },
        {
          $lookup: {
            from: "products",
            localField: "orderItems.productId",
            foreignField: "_id",
            as: "productData",
          },
        },
        {
          $lookup: {
            from: "members",
            localField: "memberId",
            foreignField: "_id",
            as: "memberData",
          },
        },
      ])
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return result;
  }

  public async updateOrderStatus(
    orderId: string,
    orderStatus: OrderStatus,
    rejectReason?: string,
  ): Promise<Order> {
    const id = shapeIntoMongooseObjectId(orderId);
    const update: { orderStatus: OrderStatus; rejectReason?: string } = {
      orderStatus: orderStatus,
    };
    if (rejectReason) update.rejectReason = rejectReason;

    const result = await this.orderModel
      .findByIdAndUpdate(id, update, { new: true })
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);
    return result;
  }
}

export default OrderService;
