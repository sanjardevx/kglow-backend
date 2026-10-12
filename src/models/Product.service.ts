import fs from "fs/promises";
import path from "path";
import { shapeIntoMongooseObjectId } from "../libs/config";
import { ProductStatus } from "../libs/enums/product.enum";
import { ObjectId } from "mongoose";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import {
  Product,
  ProductInput,
  ProductInquiry,
  ProductUpdateInput,
} from "../libs/types/product";
import ProductModel from "../schema/Product.model";
import ViewService from "./View.service";
import { ViewInput } from "../libs/types/view";
import { ViewGroup } from "../libs/enums/view.enum";
import { skipFor } from "../libs/utils/paging";

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class ProductService {
  private readonly productModel;
  public viewService;

  constructor() {
    this.productModel = ProductModel;
    this.viewService = new ViewService();
  }

  /** SPA */
  /**
   * The homepage's "brands carried" and "products" figures, counted from the
   * catalog itself so they can never drift from what the shop actually shows.
   * Same visibility as the shop list: sold-out products count, deleted don't.
   * Brands are compared on letters and digits alone — the catalog has both
   * "DR.ALTHEA" and "Dr. Althea", which are one brand typed twice.
   */
  public async getCatalogStats(): Promise<{
    productCount: number;
    brandCount: number;
  }> {
    const visible = {
      productStatus: { $in: [ProductStatus.PROCESS, ProductStatus.PAUSE] },
    };
    const [productCount, brands] = await Promise.all([
      this.productModel.countDocuments(visible).exec(),
      this.productModel.distinct("productBrand", visible).exec(),
    ]);
    const brandKeys = new Set(
      brands.map((brand: string) => brand.toLowerCase().replace(/[^a-z0-9]/g, "")),
    );
    return { productCount, brandCount: brandKeys.size };
  }

  public async getProducts(inquiry: ProductInquiry): Promise<Product[]> {
    // PROCESS = in stock, PAUSE = sold out (still shown, frontend renders the
    // "Sold Out" badge and disables purchase actions). DELETE is the only
    // status excluded here — that's a soft delete, never shown to customers.
    const match: T = {
      productStatus: { $in: [ProductStatus.PROCESS, ProductStatus.PAUSE] },
    };

    if (inquiry.productCategory)
      match.productCategory = inquiry.productCategory;
    if (inquiry.search) {
      // Multi-brand catalog: shoppers search by brand ("Missha") as often as
      // by product name, so both fields have to match.
      // Escaped: typed text is matched literally. Used raw, a crafted search
      // could stall the database with a catastrophic pattern.
      const pattern = new RegExp(escapeRegExp(inquiry.search), "i");
      match.$or = [
        { productName: { $regex: pattern } },
        { productBrand: { $regex: pattern } },
      ];
    }

    const sort: T =
      inquiry.order === "productPrice"
        ? { [inquiry.order]: 1 } // dynamic key(productPrice ni olib beryabti)
        : { [inquiry.order]: -1 };

    const result = await this.productModel
      .aggregate([
        { $match: match },
        { $sort: sort },
        { $skip: (inquiry.page * 1 - 1) * inquiry.limit }, // 1pageda(1, 2, 3). 2page(4, 5, 6)
        { $limit: inquiry.limit }, // 1page(3). 2page(3)
      ])
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return result;
  }

  public async getProduct(
    memberId: ObjectId | null,
    id: string,
  ): Promise<Product> {
    const productId = shapeIntoMongooseObjectId(id);

    let result = await this.productModel
      .findOne({
        _id: productId,
        productStatus: { $in: [ProductStatus.PROCESS, ProductStatus.PAUSE] },
      })
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    if (memberId) {
      const input: ViewInput = {
        memberId: memberId,
        viewRefId: productId,
        viewGroup: ViewGroup.PRODUCT,
      };
      const existView = await this.viewService.checkViewExistanse(input);

      console.log("exist", !!existView);
      if (!existView) {
        // Insert View
        await this.viewService.insertMemberView(input);

        // Increase Counts — only for a brand-new view
        result = await this.productModel
          .findByIdAndUpdate(
            productId,
            { $inc: { productViews: +1 } },
            { new: true },
          )
          .exec();
      }
    }

    return result;
  }

  /** SSR */

  /** Every product, in an order a dropdown reads well in. The review and
   *  tutorial forms pick from the whole catalog, so they cannot take a page
   *  of it — a product missing from the select cannot be chosen at all. */
  public async listAllProducts(): Promise<Product[]> {
    return await this.productModel
      .find()
      .sort({ productBrand: 1, productName: 1 })
      .exec();
  }

  /** SSR: one page of the admin's product list, newest first. */
  public async getAllProducts(
    page: number,
    size: number,
  ): Promise<{ list: Product[]; total: number }> {
    const total = await this.productModel.countDocuments().exec();
    const result = await this.productModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skipFor(page, size))
      .limit(size)
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return { list: result, total };
  }

  public async createNewProduct(input: ProductInput): Promise<Product> {
    try {
      return await this.productModel.create(input);
    } catch (err) {
      console.log("Error, model:createNewProduct:", err);
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
  }

  public async updateChosenProduct(
    id: string,
    input: ProductUpdateInput,
  ): Promise<Product> {
    // string => ObjectId
    id = shapeIntoMongooseObjectId(id);
    const result = await this.productModel
      .findByIdAndUpdate({ _id: id }, input, { new: true })
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);

    return result;
  }

  /**
   * Full edit from the admin drawer. `keptImages` is what the admin left in
   * place; it is filtered against what the product actually holds, so a
   * tampered request can never write an arbitrary path into the record.
   */
  public async editChosenProduct(
    id: string,
    input: ProductUpdateInput,
    keptImages: string[],
    newImagePaths: string[],
  ): Promise<Product> {
    const objectId = shapeIntoMongooseObjectId(id);

    const previous = await this.productModel.findById(objectId).exec();
    if (!previous) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    const kept: string[] = previous.productImages.filter((image: string) =>
      keptImages.includes(image),
    );
    const productImages = [...kept, ...newImagePaths];
    if (!productImages.length)
      throw new Errors(HttpCode.BAD_REQUEST, Message.PRODUCT_NEEDS_IMAGE);

    const result = await this.productModel
      .findByIdAndUpdate(
        { _id: objectId },
        { ...input, productImages },
        { new: true },
      )
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);

    // Only once the row is safely updated: an orphaned file is harmless, but
    // a deleted file with a record still pointing at it is a broken image.
    const dropped = previous.productImages.filter(
      (image: string) => !productImages.includes(image),
    );
    await Promise.all(dropped.map((image: string) => this.removeImageFile(image)));

    return result;
  }

  private async removeImageFile(imagePath: string): Promise<void> {
    try {
      await fs.unlink(path.resolve(imagePath));
    } catch (err) {
      // Already gone, or never written — neither should fail the update.
      console.log("Could not remove image file:", imagePath);
    }
  }
}
export default ProductService;
