import { shapeIntoMongooseObjectId } from "../libs/config";
import { ReviewStatus } from "../libs/enums/review.enum";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { Review, ReviewInput, ReviewUpdateInput } from "../libs/types/review";
import ReviewModel from "../schema/Review.model";

class ReviewService {
  private readonly reviewModel;

  constructor() {
    this.reviewModel = ReviewModel;
  }

  /** SPA */
  public async getProductReviews(id: string): Promise<Review[]> {
    const productId = shapeIntoMongooseObjectId(id);

    const result = await this.reviewModel
      .find({ productId: productId, reviewStatus: ReviewStatus.ACTIVE })
      .sort({ createdAt: -1 })
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }

  /** SPA — cross-product feed for the Home page "Customer Love" section */
  public async getReviews(limit: number): Promise<Review[]> {
    const result = await this.reviewModel
      .aggregate([
        { $match: { reviewStatus: ReviewStatus.ACTIVE } },
        { $sort: { createdAt: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            as: "productData",
          },
        },
      ])
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }

  /** SSR */

  public async getAllReviews(): Promise<Review[]> {
    const result = await this.reviewModel
      .aggregate([
        { $sort: { createdAt: -1 } },
        {
          $lookup: {
            from: "products",
            localField: "productId",
            foreignField: "_id",
            as: "productData",
          },
        },
      ])
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }

  public async createNewReview(input: ReviewInput): Promise<Review> {
    try {
      input.productId = shapeIntoMongooseObjectId(input.productId);
      return await this.reviewModel.create(input);
    } catch (err) {
      console.log("Error, model:createNewReview:", err);
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
  }

  public async updateChosenReview(
    id: string,
    input: ReviewUpdateInput,
  ): Promise<Review> {
    // string => ObjectId
    id = shapeIntoMongooseObjectId(id);
    const result = await this.reviewModel
      .findByIdAndUpdate({ _id: id }, input, { new: true })
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);

    return result;
  }
}
export default ReviewService;
