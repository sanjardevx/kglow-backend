import { Request, Response } from "express";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import ProductService from "../models/Product.service";
import { AdminRequest, ExtendenRequest } from "../libs/types/member";
import { ProductInput, ProductInquiry } from "../libs/types/product";
import {
  parseIdParam,
  parseInput,
  productInquiry,
} from "../libs/validation";
import { reportError, sendError } from "../libs/utils/monitoring";
import { redirectWithNotice } from "../libs/utils/notice";

const productService = new ProductService();

const productController: T = {};

/** SPA */
productController.getProducts = async (req: Request, res: Response) => {
  try {
    console.log("getProducts");
    const inquiry: ProductInquiry = parseInput(productInquiry, req.query);

    const result = await productService.getProducts(inquiry);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getProducts", err);
    sendError(res, err);
  }
};

productController.getCatalogStats = async (req: Request, res: Response) => {
  try {
    const result = await productService.getCatalogStats();
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getCatalogStats", err);
    sendError(res, err);
  }
};

productController.getProduct = async (req: ExtendenRequest, res: Response) => {
  try {
    console.log("getProduct");

    const id = parseIdParam(req.params.id);
    const memberId = req.member?._id ?? null,
      result = await productService.getProduct(memberId, id);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getProduct", err);
    sendError(res, err);
  }
};

/** SSR */
productController.getAllProducts = async (req: Request, res: Response) => {
  try {
    console.log("getAllProducts");
    // The whole catalog on one page: the shop has tens of products, and the
    // page's search, filters and sorting work on all of them at once.
    const products = await productService.getAllProducts();
    res.render("products", { products });
  } catch (err) {
    console.log("Error on getAllProducts", err);
    sendError(res, err);
  }
};

productController.createNewProduct = async (
  req: AdminRequest,
  res: Response,
) => {
  try {
    console.log("createNewProduct");
    console.log("req.body:", req.body);
    if (!req.files?.length)
      throw new Errors(HttpCode.INTERNAL_SERVER_ERROR, Message.CREATE_FAILED);

    const data: ProductInput = req.body;
    data.productImages = req.files?.map((ele) => {
      return ele.path;
    });

    await productService.createNewProduct(data);
    redirectWithNotice(
      req,
      res,
      "/admin/product/all",
      "good",
      `${data.productName} added to the catalog.`,
    );
  } catch (err) {
    console.log("Error on createNewProduct", err);
    if (!(err instanceof Errors)) reportError(err);
    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;
    redirectWithNotice(req, res, "/admin/product/all", "bad", message);
  }
};

productController.updateChosenProduct = async (req: Request, res: Response) => {
  try {
    console.log("updateChosenProduct");
    const id = req.params.id;

    const result = await productService.updateChosenProduct(id, req.body);

    res.status(HttpCode.OK).json({ data: result });
  } catch (err) {
    console.log("Error on updateChosenProduct", err);
    sendError(res, err);
  }
};

productController.editChosenProduct = async (
  req: AdminRequest,
  res: Response,
) => {
  try {
    console.log("editChosenProduct");
    const id = req.params.id;

    // multipart can't carry an array natively, so the drawer sends the paths
    // it kept as a JSON string alongside whatever files it uploaded.
    const { keptImages, ...input } = req.body;
    const kept: string[] = keptImages ? JSON.parse(keptImages) : [];
    const newImagePaths = (req.files ?? []).map((file) => file.path);

    if (Number(input.productPrice) < 0 || Number(input.productLeftCount) < 0)
      throw new Errors(HttpCode.BAD_REQUEST, Message.INVALID_PRODUCT_NUMBERS);

    const result = await productService.editChosenProduct(
      id,
      input,
      kept,
      newImagePaths,
    );

    res.status(HttpCode.OK).json({ data: result });
  } catch (err) {
    console.log("Error on editChosenProduct", err);
    // brand + name + volume is a unique index, so a rename can collide —
    // that reads as a plain 500 unless it's translated here.
    if ((err as { code?: number }).code === 11000)
      res.status(HttpCode.BAD_REQUEST).json({
        code: HttpCode.BAD_REQUEST,
        message: Message.DUPLICATE_PRODUCT,
      });
    else sendError(res, err);
  }
};

export default productController;
