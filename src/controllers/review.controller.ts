import { Request, Response } from "express";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import ReviewService from "../models/Review.service";
import ProductService from "../models/Product.service";
import { AdminRequest } from "../libs/types/member";
import { ReviewInput } from "../libs/types/review";
import { listInquiry, parseIdParam, parseInput } from "../libs/validation";
import { reportError, sendError } from "../libs/utils/monitoring";

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
    const data = await reviewService.getAllReviews();
    // the select in the "New Review" form needs the real product list
    const products = await productService.listAllProducts();

    res.render("reviews", { reviews: data, products: products });
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
    res.send(
      `<script>alert("Successful creation"); window.location.replace('/admin/review/all') </script>`,
    );
  } catch (err) {
    console.log("Error on createNewReview", err);
    if (!(err instanceof Errors)) reportError(err);
    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;
    res.send(
      `<script>alert("${message}"); window.location.replace('/admin/review/all') </script>`,
    );
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
