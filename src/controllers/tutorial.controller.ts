import { Request, Response } from "express";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import TutorialService from "../models/Tutorial.service";
import ProductService from "../models/Product.service";
import { AdminRequest } from "../libs/types/member";
import { TutorialInput, TutorialInquiry } from "../libs/types/tutorial";
import { listInquiry, parseIdParam, parseInput } from "../libs/validation";
import { ProductStatus } from "../libs/enums/product.enum";
import { reportError, sendError } from "../libs/utils/monitoring";
import { redirectWithNotice } from "../libs/utils/notice";
import {
  ADMIN_PAGE_SIZE,
  pageFromQuery,
  pagingFor,
} from "../libs/utils/paging";

const tutorialService = new TutorialService();
const productService = new ProductService();

const tutorialController: T = {};

/** SPA */
tutorialController.getTutorials = async (req: Request, res: Response) => {
  try {
    console.log("getTutorials");
    const inquiry: TutorialInquiry = parseInput(listInquiry, req.query);

    const result = await tutorialService.getTutorials(inquiry);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getTutorials", err);
    sendError(res, err);
  }
};

tutorialController.getTutorial = async (req: Request, res: Response) => {
  try {
    console.log("getTutorial");
    const id = parseIdParam(req.params.id);

    const result = await tutorialService.getTutorial(id);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getTutorial", err);
    sendError(res, err);
  }
};

/** SSR */
tutorialController.getAllTutorials = async (req: Request, res: Response) => {
  try {
    console.log("getAllTutorials");
    const page = pageFromQuery(req.query.page);
    const { list, total } = await tutorialService.getAllTutorials(
      page,
      ADMIN_PAGE_SIZE,
    );
    const paging = pagingFor(total, page);
    if (page > paging.pages)
      return res.redirect(`/admin/tutorial/all?page=${paging.pages}`);

    // The form's two selects are driven by the real catalog: every brand we
    // actually stock, and the products behind them (the brand choice
    // narrows the product list client-side, so the admin never scrolls the
    // whole catalog). Soft-deleted products are left out of both.
    const products = (await productService.listAllProducts()).filter(
      (product) => product.productStatus !== ProductStatus.DELETE,
    );
    const brands = [
      ...new Set(products.map((product) => product.productBrand)),
    ].sort((a, b) => a.localeCompare(b));

    res.render("tutorials", { tutorials: list, products, brands, paging });
  } catch (err) {
    console.log("Error on getAllTutorials", err);
    sendError(res, err);
  }
};

tutorialController.createNewTutorial = async (
  req: AdminRequest,
  res: Response,
) => {
  try {
    console.log("createNewTutorial");
    console.log("req.body:", req.body);

    const data: TutorialInput = req.body;

    await tutorialService.createNewTutorial(data);
    redirectWithNotice(
      req,
      res,
      "/admin/tutorial/all",
      "good",
      "Tutorial added.",
    );
  } catch (err) {
    console.log("Error on createNewTutorial", err);
    if (!(err instanceof Errors)) reportError(err);
    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;
    redirectWithNotice(req, res, "/admin/tutorial/all", "bad", message);
  }
};

tutorialController.updateChosenTutorial = async (
  req: Request,
  res: Response,
) => {
  try {
    console.log("updateChosenTutorial");
    const id = req.params.id;

    const result = await tutorialService.updateChosenTutorial(id, req.body);

    res.status(HttpCode.OK).json({ data: result });
  } catch (err) {
    console.log("Error on updateChosenTutorial", err);
    sendError(res, err);
  }
};

tutorialController.deleteTutorial = async (req: Request, res: Response) => {
  try {
    console.log("deleteTutorial");
    const id = req.params.id;

    const result = await tutorialService.deleteTutorial(id);

    res.status(HttpCode.OK).json({ data: result });
  } catch (err) {
    console.log("Error on deleteTutorial", err);
    sendError(res, err);
  }
};

export default tutorialController;
