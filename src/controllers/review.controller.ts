import { Request, Response } from "express";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import ReviewService from "../models/Review.service";
import ProductService from "../models/Product.service";
import { AdminRequest } from "../libs/types/member";
import { ReviewInput } from "../libs/types/review";
import { listInquiry, parseIdParam, parseInput } from "../libs/validation";
import { reportError, sendError } from "../libs/utils/monitoring";
import { redirectWithNotice } from "../libs/utils/notice";
import {
  ADMIN_PAGE_SIZE,
  pageFromQuery,
  pagingFor,
} from "../libs/utils/paging";

const reviewService = new ReviewService();
const productService = new ProductService();

const reviewController: T = {};

/** SPA */
reviewController.getProductReviews = async (req: Request, res: Response) => {
  try {
    console.log("getProductReviews");
    const productId = parseIdParam(req.params.productId);

    const result = await reviewService.getProductReviews(productId);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getProductReviews", err);
    sendError(res, err);
  }
};

/** SPA */
reviewController.getReviews = async (req: Request, res: Response) => {
  try {
    console.log("getReviews");
    const { limit } = parseInput(listInquiry, req.query);

    const result = await reviewService.getReviews(limit);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getReviews", err);
    sendError(res, err);
  }
};

/** SSR */
reviewController.getAllReviews = async (req: Request, res: Response) => {
  try {
    console.log("getAllReviews");
    const page = pageFromQuery(req.query.page);
    const { list, total } = await reviewService.getAllReviews(
      page,
      ADMIN_PAGE_SIZE,
    );
    const paging = pagingFor(total, page);
    if (page > paging.pages)
      return res.redirect(`/admin/review/all?page=${paging.pages}`);
    // the select in the "New Review" form needs the real product list
    const products = await productService.listAllProducts();

    res.render("reviews", { reviews: list, products: products, paging });
  } catch (err) {
    console.log("Error on getAllReviews", err);
    sendError(res, err);
  }
};

reviewController.createNewReview = async (req: AdminRequest, res: Response) => {
  try {
    console.log("createNewReview");
    console.log("req.body:", req.body);

    const data: ReviewInput = req.body;

    await reviewService.createNewReview(data);
    redirectWithNotice(req, res, "/admin/review/all", "good", "Review added.");
  } catch (err) {
    console.log("Error on createNewReview", err);
    if (!(err instanceof Errors)) reportError(err);
    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;
    redirectWithNotice(req, res, "/admin/review/all", "bad", message);
  }
};

reviewController.updateChosenReview = async (req: Request, res: Response) => {
  try {
    console.log("updateChosenReview");
    const id = req.params.id;

    const result = await reviewService.updateChosenReview(id, req.body);

    res.status(HttpCode.OK).json({ data: result });
  } catch (err) {
    console.log("Error on updateChosenReview", err);
    sendError(res, err);
  }
};

export default reviewController;
