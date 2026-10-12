/**
 * Purpose:  Maps all /* URLs for the React SPA to member controller methods
 * Called by: app.ts — app.use("/", router)
 * Sends to:  member.controller.ts
 * Flow:     Browser → /* → router → memberController → Service → DB
 */

import express from "express";
const router = express.Router(); // creates a mini-router (handles routes for the React SPA)
import memberController from "./controllers/member.controller";
import productController from "./controllers/product.controller";
import uploader from "./libs/utils/uploader";
import orderController from "./controllers/order.controller";
import reviewController from "./controllers/review.controller";
import tutorialController from "./controllers/tutorial.controller";
import discountController from "./controllers/discount.controller";
import { loginLimiter, signupLimiter } from "./libs/utils/rateLimiter";

//** Member **/
router.post("/member/login", loginLimiter, memberController.login);
router.post("/member/signup", signupLimiter, memberController.signup);
router.post("/member/google", loginLimiter, memberController.googleAuth);
router.post(
  "/member/logout",
  memberController.verifyAuth,
  memberController.logout,
);
router.get(
  "/member/detail",
  memberController.verifyAuth,
  memberController.getMemberDetails,
);
router.post(
  "/member/update",
  memberController.verifyAuth,
  uploader("members").single("memberImage"),
  memberController.updateMember,
);
router.get("/member/top-users", memberController.getTopUsers);

//** Product **/
router.get("/product/all", productController.getProducts);
// Before /product/:id, or "stats" would be read as a product id.
router.get("/product/stats", productController.getCatalogStats);
router.get(
  "/product/:id",
  memberController.retrieveAuth,
  productController.getProduct,
);

//** Review **/
router.get("/review/all", reviewController.getReviews);
router.get("/review/product/:productId", reviewController.getProductReviews);

//** Tutorial **/
router.get("/tutorial/all", tutorialController.getTutorials);
router.get("/tutorial/:id", tutorialController.getTutorial);

//** Discount **/
// Open: the storefront reads the running sale before anyone signs in, so the
// banner and the basket can quote the same number the checkout will apply.
router.get("/discount/active", discountController.getActiveDiscount);

//** Order **/
router.post(
  "/order/create",
  memberController.verifyAuth,
  uploader("orders").array("paymentProof", 4),
  orderController.createOrder,
);
router.get(
  "/order/all",
  memberController.verifyAuth,
  orderController.getMyOrders,
);

export default router;
