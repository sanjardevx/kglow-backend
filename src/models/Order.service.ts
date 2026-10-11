import { shapeIntoMongooseObjectId } from "./../libs/config";
import OrderItemModel from "../schema/OrderItem.model";
import OrderModel from "../schema/Order.model";
import { Member } from "../libs/types/member";
import {
  Order,
  OrderCreateInput,
  OrderInquiry,
  OrderItemInput,
  OrderItemRequest,
} from "../libs/types/order";
import Errors, { HttpCode, Message } from "../libs/Errors";
import mongoose, { ClientSession, ObjectId } from "mongoose";
import { OrderStatus } from "../libs/enums/order.enum";
import { ProductStatus } from "../libs/enums/product.enum";
import ProductModel from "../schema/Product.model";
import DiscountService from "./Discount.service";
import { calculateOrderTotals } from "../libs/utils/orderTotals";
import { skipFor } from "../libs/utils/paging";

class OrderService {
  private readonly orderModel;
  private readonly orderItemModel;
  private readonly productModel;
  private readonly discountService;

  constructor() {
    this.orderModel = OrderModel;
    this.orderItemModel = OrderItemModel;
    this.productModel = ProductModel;
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

    // All or nothing: the stock comes off, the order and its lines are written,
    // or none of it happens. Two shoppers racing for the last unit can't both
    // win — the losing transaction sees the stock already gone.
    const session = await mongoose.startSession();
    try {
      let newOrder!: Order;
      await session.withTransaction(async () => {
        await this.reserveStock(pricedItems, session);
        [newOrder] = await this.orderModel.create(
          [
            {
              orderSubtotal: totals.subtotal,
              orderDiscountPercent: totals.discountPercent,
              orderDiscount: totals.discount,
              // Never part of what the shopper transfers: free above the
              // threshold, and paid to the courier on pickup below it.
              orderDelivery: 0,
              orderTotal: totals.total,
              memberId: memberId,
              deliveryAddress: input.deliveryAddress,
              transferNote: input.transferNote,
              paymentProof: input.paymentProof,
              stockReserved: true,
            },
          ],
          { session },
        );
        await this.recordOrderItems(newOrder._id, pricedItems, session);
      });
      return newOrder;
    } catch (err) {
      console.log("Error, model:createOrder:", err);
      if (err instanceof Errors) throw err;
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Takes each line's quantity off the shelf, but only while the product is
   * on sale and has that many left — checked and taken in one step, so a
   * stock count can never go below zero.
   */
  private async reserveStock(
    items: OrderItemInput[],
    session: ClientSession,
  ): Promise<void> {
    for (const item of items) {
      const product = await this.productModel
        .findOneAndUpdate(
          {
            _id: item.productId,
            productStatus: ProductStatus.PROCESS,
            productLeftCount: { $gte: item.itemQuantity },
          },
          { $inc: { productLeftCount: -item.itemQuantity } },
          { new: true, session },
        )
        .exec();
      if (!product)
        throw new Errors(HttpCode.BAD_REQUEST, Message.NOT_ENOUGH_STOCK);

      // The last unit just went: the shop shows it as sold out rather than
      // letting the next shopper fill a basket checkout would refuse.
      if (product.productLeftCount === 0)
        await this.productModel
          .updateOne(
            { _id: product._id },
            { productStatus: ProductStatus.PAUSE },
            { session },
          )
          .exec();
    }
  }

  /**
   * Puts a rejected order's quantities back. A product that was sold out
   * because it ran out goes back on sale; one the admin paused by hand while
   * stock was left stays paused — that was a decision, not a count.
   */
  private async releaseStock(
    orderId: ObjectId,
    session: ClientSession,
  ): Promise<void> {
    const items = await this.orderItemModel
      .find({ orderId: orderId }, null, { session })
      .exec();

    for (const item of items) {
      const before = await this.productModel
        .findOneAndUpdate(
          { _id: item.productId },
          { $inc: { productLeftCount: item.itemQuantity } },
          { new: false, session },
        )
        .exec();

      if (
        before?.productStatus === ProductStatus.PAUSE &&
        before.productLeftCount <= 0
      )
        await this.productModel
          .updateOne(
            { _id: item.productId },
            { productStatus: ProductStatus.PROCESS },
            { session },
          )
          .exec();
    }
  }

  /**
   * A product deleted or sold out since it was added to the basket stops the
   * whole order rather than being dropped or priced at zero — the shopper is
   * about to transfer money against this total by hand.
   */
  private async priceItems(
    items: OrderItemRequest[],
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
        productStatus: ProductStatus.PROCESS,
      })
      .exec();

    const priceById = new Map(
      products.map((product) => [String(product._id), product.productPrice]),
    );

    return items.map((item) => {
      const price = priceById.get(String(item.productId));
      if (price === undefined)
        throw new Errors(HttpCode.BAD_REQUEST, Message.PRODUCT_UNAVAILABLE);

      return {
        productId: shapeIntoMongooseObjectId(item.productId),
        itemQuantity: item.itemQuantity,
        itemPrice: price,
      };
    });
  }

  private async recordOrderItems(
    orderId: ObjectId,
    input: OrderItemInput[],
    session: ClientSession,
  ): Promise<void> {
    // One insert rather than one per line: a transaction's operations can't
    // run in parallel on the same session.
    await this.orderItemModel.insertMany(
      input.map((item) => ({ ...item, orderId: orderId })),
      { session },
    );
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

  /** SSR: one page of the admin's order list, newest first, with the total so
   *  the pager knows how many pages there are. */
  public async getAllOrders(
    page: number,
    size: number,
  ): Promise<{ list: Order[]; total: number }> {
    const total = await this.orderModel.countDocuments().exec();
    const result = await this.orderModel
      .aggregate([
        { $sort: { createdAt: -1 } },
        { $skip: skipFor(page, size) },
        { $limit: size },
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
    return { list: result, total };
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

    const session = await mongoose.startSession();
    try {
      let result!: Order;
      await session.withTransaction(async () => {
        // Only a waiting order can be decided — the admin page only offers the
        // buttons then, and deciding twice would hand the stock back twice.
        result = await this.orderModel
          .findOneAndUpdate(
            { _id: id, orderStatus: OrderStatus.WAITING_CONFIRMATION },
            update,
            { new: true, session },
          )
          .exec();
        if (!result)
          throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);

        if (orderStatus === OrderStatus.REJECTED && result.stockReserved)
          await this.releaseStock(result._id, session);
      });
      return result;
    } finally {
      await session.endSession();
    }
  }
}

export default OrderService;
