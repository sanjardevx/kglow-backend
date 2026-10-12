/**
 * Everything the admin's dashboard shows, in one place.
 *
 * Each figure is a separate aggregation rather than one clever pipeline: they
 * answer different questions over different windows, and a dashboard that is
 * read a few times a day does not need the saving badly enough to be
 * unreadable.
 */
import OrderModel from "../schema/Order.model";
import OrderItemModel from "../schema/OrderItem.model";
import ProductModel from "../schema/Product.model";
import { OrderStatus } from "../libs/enums/order.enum";
import { ProductStatus } from "../libs/enums/product.enum";

/** The shop and its admin are in Uzbekistan, so a "day" on the chart has to
 *  start at midnight there — bucketing in UTC would move five hours of every
 *  evening's orders into the next day. */
const SHOP_TIMEZONE = "Asia/Tashkent";

/** Below this, a product is about to sell out and the admin should reorder. */
export const LOW_STOCK_AT = 3;

const TREND_DAYS = 14;
const WINDOW_DAYS = 30;

export interface KpiDelta {
  value: number;
  previous: number;
}

export interface DashboardData {
  waitingCount: number;
  revenue: KpiDelta;
  orders: KpiDelta;
  lowStock: {
    _id: string;
    productName: string;
    productBrand: string;
    productLeftCount: number;
  }[];
  revenueByDay: { day: string; label: string; total: number }[];
  statusCounts: { waiting: number; confirmed: number; rejected: number };
  topProducts: { productName: string; units: number }[];
  waitingOldest: {
    _id: string;
    memberNick: string;
    orderTotal: number;
    createdAt: Date;
  }[];
}

function daysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

class DashboardService {
  private readonly orderModel = OrderModel;
  private readonly orderItemModel = OrderItemModel;
  private readonly productModel = ProductModel;

  public async getDashboard(): Promise<DashboardData> {
    const [
      statusCounts,
      revenue,
      orders,
      lowStock,
      revenueByDay,
      topProducts,
      waitingOldest,
    ] = await Promise.all([
      this.statusCounts(),
      this.confirmedRevenue(),
      this.orderCounts(),
      this.lowStock(),
      this.revenueByDay(),
      this.topProducts(),
      this.waitingOldest(),
    ]);

    return {
      waitingCount: statusCounts.waiting,
      revenue,
      orders,
      lowStock,
      revenueByDay,
      statusCounts,
      topProducts,
      waitingOldest,
    };
  }

  /** How the whole order history came out — the three tiles on the right. */
  private async statusCounts() {
    const rows = await this.orderModel
      .aggregate([{ $group: { _id: "$orderStatus", count: { $sum: 1 } } }])
      .exec();

    const by = (status: OrderStatus) =>
      rows.find((row) => row._id === status)?.count ?? 0;

    return {
      waiting: by(OrderStatus.WAITING_CONFIRMATION),
      confirmed: by(OrderStatus.CONFIRMED),
      rejected: by(OrderStatus.REJECTED),
    };
  }

  /** Only confirmed orders count as money: a waiting one may still be
   *  rejected, and a rejected one was never paid. */
  private async confirmedRevenue(): Promise<KpiDelta> {
    const rows = await this.orderModel
      .aggregate([
        {
          $match: {
            orderStatus: OrderStatus.CONFIRMED,
            createdAt: { $gte: daysAgo(WINDOW_DAYS * 2) },
          },
        },
        {
          $group: {
            _id: { $gte: ["$createdAt", daysAgo(WINDOW_DAYS)] },
            total: { $sum: "$orderTotal" },
          },
        },
      ])
      .exec();

    return {
      value: rows.find((row) => row._id === true)?.total ?? 0,
      previous: rows.find((row) => row._id === false)?.total ?? 0,
    };
  }

  /** Every order placed, whatever became of it — this measures demand, which
   *  is a different question from revenue. */
  private async orderCounts(): Promise<KpiDelta> {
    const rows = await this.orderModel
      .aggregate([
        { $match: { createdAt: { $gte: daysAgo(WINDOW_DAYS * 2) } } },
        {
          $group: {
            _id: { $gte: ["$createdAt", daysAgo(WINDOW_DAYS)] },
            count: { $sum: 1 },
          },
        },
      ])
      .exec();

    return {
      value: rows.find((row) => row._id === true)?.count ?? 0,
      previous: rows.find((row) => row._id === false)?.count ?? 0,
    };
  }

  /** Paused and deleted products are left out: they are not on sale, so their
   *  stock is not a thing to act on. */
  private async lowStock(): Promise<DashboardData["lowStock"]> {
    return (await this.productModel
      .find({
        productStatus: ProductStatus.PROCESS,
        productLeftCount: { $lte: LOW_STOCK_AT },
      })
      .sort({ productLeftCount: 1 })
      .limit(6)
      .select("productName productBrand productLeftCount")
      .lean()
      .exec()) as DashboardData["lowStock"];
  }

  /**
   * Confirmed revenue per day for the trend chart. Mongo only returns the
   * days that had an order, so the result is filled out here — a gap in the
   * data has to read as a zero on the chart, not as a missing bar.
   */
  private async revenueByDay() {
    const rows = await this.orderModel
      .aggregate([
        {
          $match: {
            orderStatus: OrderStatus.CONFIRMED,
            createdAt: { $gte: daysAgo(TREND_DAYS - 1) },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: SHOP_TIMEZONE,
              },
            },
            total: { $sum: "$orderTotal" },
          },
        },
      ])
      .exec();

    const byDay = new Map<string, number>(
      rows.map((row) => [row._id as string, row.total as number]),
    );

    const days: { day: string; label: string; total: number }[] = [];
    for (let back = TREND_DAYS - 1; back >= 0; back--) {
      const date = daysAgo(back);
      const day = date.toLocaleDateString("en-CA", { timeZone: SHOP_TIMEZONE });
      days.push({
        day,
        label: date.toLocaleDateString("en-US", {
          timeZone: SHOP_TIMEZONE,
          month: "short",
          day: "numeric",
        }),
        total: byDay.get(day) ?? 0,
      });
    }
    return days;
  }

  /** What actually sells, by units rather than by money — the answer drives
   *  reordering, and a cheap product shifting in volume matters there. */
  private async topProducts() {
    return await this.orderItemModel
      .aggregate([
        {
          $lookup: {
            from: "orders",
            localField: "orderId",
            foreignField: "_id",
            as: "order",
          },
        },
        { $unwind: "$order" },
        {
          $match: {
            "order.orderStatus": OrderStatus.CONFIRMED,
            "order.createdAt": { $gte: daysAgo(WINDOW_DAYS) },
          },
        },
        { $group: { _id: "$productId", units: { $sum: "$itemQuantity" } } },
        { $sort: { units: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "product",
          },
        },
        {
          $project: {
            _id: 0,
            units: 1,
            productName: {
              $ifNull: [
                { $first: "$product.productName" },
                "Product since removed",
              ],
            },
          },
        },
      ])
      .exec();
  }

  /** Oldest first, not newest: the one that has been waiting longest is the
   *  one a shopper is still sitting in front of. */
  private async waitingOldest() {
    return await this.orderModel
      .aggregate([
        { $match: { orderStatus: OrderStatus.WAITING_CONFIRMATION } },
        { $sort: { createdAt: 1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "members",
            localField: "memberId",
            foreignField: "_id",
            as: "member",
          },
        },
        {
          $project: {
            orderTotal: 1,
            createdAt: 1,
            memberNick: {
              $ifNull: [{ $first: "$member.memberNick" }, "Unknown"],
            },
          },
        },
      ])
      .exec();
  }
}

export default DashboardService;
