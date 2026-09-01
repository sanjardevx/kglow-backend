import { Request, Response } from "express";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import ReviewService from "../models/Review.service";
import ProductService from "../models/Product.service";
import { AdminRequest } from "../libs/types/member";
import { ReviewInput } from "../libs/types/review";

const reviewService = new ReviewService();
const productService = new ProductService();

const reviewController: T = {};

/** SPA */
reviewController.getProductReviews = async (req: Request, res: Response) => {
  try {
    console.log("getProductReviews");
    const { productId } = req.params;

    const result = await reviewService.getProductReviews(productId);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getProductReviews", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

/** SPA */
reviewController.getReviews = async (req: Request, res: Response) => {
  try {
    console.log("getReviews");
    const limit = req.query.limit ? Number(req.query.limit) : 12;

    const result = await reviewService.getReviews(limit);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getReviews", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

/** SSR */
reviewController.getAllReviews = async (req: Request, res: Response) => {
  try {
    console.log("getAllReviews");
    const data = await reviewService.getAllReviews();
    // the select in the "New Review" form needs the real product list
    const products = await productService.getAllProducts();

    res.render("reviews", { reviews: data, products: products });
  } catch (err) {
    console.log("Error on getAllReviews", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
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
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

export default reviewController;
