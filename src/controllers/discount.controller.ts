import { Request, Response } from "express";
import { T } from "../libs/types/common";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { AdminRequest } from "../libs/types/member";
import { DiscountUpdateInput } from "../libs/types/discount";
import DiscountService from "../models/Discount.service";

const discountService = new DiscountService();

const discountController: T = {};

/** SPA */
discountController.getActiveDiscount = async (req: Request, res: Response) => {
  try {
    const result = await discountService.getActiveDiscount();

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    // The storefront asks for this on every page load, so a failure here
    // must not break the shop. "No sale" is the safe answer: the banner
    // falls back and nothing quotes a discount the checkout would not apply.
    console.log("Error on getActiveDiscount", err);
    res.status(HttpCode.OK).json({ percent: 0, label: "", endsOn: "" });
  }
};

/** SSR */
discountController.getDiscountPage = async (req: AdminRequest, res: Response) => {
  try {
    console.log("getDiscountPage");
    const settings = await discountService.getSettings();

    res.render("discount", { settings });
  } catch (err) {
    console.log("Error on getDiscountPage", err);
    res.redirect("/admin");
  }
};

discountController.updateDiscount = async (
  req: AdminRequest,
  res: Response,
) => {
  try {
    console.log("updateDiscount");
    const input: DiscountUpdateInput = req.body;

    const result = await discountService.updateSettings(input);
    const note = result.discountIsActive
      ? `Sale is ON at ${result.discountPercent}%`
      : "Sale is OFF";

    res.send(
      `<script>alert("Saved — ${note}"); window.location.replace('/admin/discount') </script>`,
    );
  } catch (err) {
    console.log("Error on updateDiscount", err);
    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;
    res.send(
      `<script>alert("${message}"); window.location.replace('/admin/discount') </script>`,
    );
  }
};

export default discountController;
