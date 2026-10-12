import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import { ExtendenRequest } from "../libs/types/member";
import { Request, Response } from "express";
import OrderService from "../models/Order.service";
import { OrderCreateInput, OrderInquiry } from "../libs/types/order";
import {
  orderCreateInput,
  orderDecisionInput,
  orderInquiry,
  parseInput,
} from "../libs/validation";
import { OrderStatus } from "../libs/enums/order.enum";
import { sendError } from "../libs/utils/monitoring";
import {
  ADMIN_PAGE_SIZE,
  pageFromQuery,
  pagingFor,
} from "../libs/utils/paging";

const orderService = new OrderService();

const orderController: T = {};

orderController.createOrder = async (req: ExtendenRequest, res: Response) => {
  try {
    console.log("createOrder");
    const input: OrderCreateInput = {
      ...parseInput(orderCreateInput, req.body),
      paymentProof: req.files?.map((file) => file.path),
    };
    const result = await orderService.createOrder(req.member, input);

    res.status(HttpCode.CREATED).json(result);
  } catch (err) {
    console.log("Error on createOrder", err);
    sendError(res, err);
  }
};

orderController.getMyOrders = async (req: ExtendenRequest, res: Response) => {
  try {
    console.log("getMyOrders");
    const inquiry: OrderInquiry = parseInput(orderInquiry, req.query);
    console.log("inquiry:", inquiry);
    const result = await orderService.getMyOrders(req.member, inquiry);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getMyOrders", err);
    sendError(res, err);
  }
};

/** SSR */
orderController.getAllOrders = async (req: Request, res: Response) => {
  try {
    console.log("getAllOrders");
    const page = pageFromQuery(req.query.page);
    // Anything that isn't one of the three states means "all of them", so a
    // hand-typed or stale ?status= shows the whole list rather than nothing.
    const asked = String(req.query.status ?? "").toUpperCase();
    const status = Object.values(OrderStatus).find((s) => s === asked);

    const [{ list, total }, counts] = await Promise.all([
      orderService.getAllOrders(page, ADMIN_PAGE_SIZE, status),
      orderService.countByStatus(),
    ]);
    const paging = pagingFor(total, page);
    const query = status ? `status=${status}&` : "";
    if (page > paging.pages)
      return res.redirect(`/admin/order/all?${query}page=${paging.pages}`);

    res.render("order-confirmation", {
      orders: list,
      paging,
      counts,
      status: status ?? "",
    });
  } catch (err) {
    console.log("Error on getAllOrders", err);
    sendError(res, err);
  }
};

orderController.updateOrderStatus = async (req: Request, res: Response) => {
  try {
    console.log("updateOrderStatus");
    const { orderId, orderStatus, rejectReason } = parseInput(
      orderDecisionInput,
      req.body,
    );

    // A rejection with no explanation is exactly what this feature exists to
    // fix, so the reason is required on that path and ignored on the others.
    if (orderStatus === OrderStatus.REJECTED && !rejectReason?.trim())
      throw new Errors(HttpCode.BAD_REQUEST, Message.REJECT_NEEDS_REASON);

    const result = await orderService.updateOrderStatus(
      orderId,
      orderStatus,
      rejectReason?.trim(),
    );
    res.status(HttpCode.OK).json({ data: result });
  } catch (err) {
    console.log("Error on updateOrderStatus", err);
    sendError(res, err);
  }
};

export default orderController;
