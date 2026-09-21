/**
 * Purpose:  Maps all /admin/* URLs to the correct admin controller method
 * Called by: app.ts — app.use("/admin", routerAdmin)
 * Sends to:  admin.controller.ts
 * Flow:     Browser → /admin/* → routerAdmin → adminController → Service → DB
 */

import express from "express";
const routerAdmin = express.Router(); // creates a mini-router just for admin pages
import adminController from "./controllers/admin.controller";
import productController from "./controllers/product.controller";
import orderController from "./controllers/order.controller";
import reviewController from "./controllers/review.controller";
import tutorialController from "./controllers/tutorial.controller";
import discountController from "./controllers/discount.controller";
import makeUploader from "./libs/utils/uploader";

/** Auth / session **/
routerAdmin.get("/", adminController.goHome); // GET  /admin/        → shows admin home page

routerAdmin
  .get("/login", adminController.getLogin) // GET  /admin/login   → shows the login form
  .post("/login", adminController.processLogin); // POST /admin/login   → handles login form submission

routerAdmin
  .get("/signup", adminController.getSignup) // GET  /admin/signup  → shows the signup form
  .post(
    "/signup",
    makeUploader("members").single("memberImage"),
    adminController.processSignup, // POST /admin/signup  → handles signup form submission
  );
routerAdmin.get("/logout", adminController.logout);
routerAdmin.get("/check-me", adminController.checkAuthSession);

/** Product routes  **/
routerAdmin.get(
  "/product/all",
  adminController.verifyAdvisor,
  productController.getAllProducts,
);
routerAdmin.post(
  "/product/create",
  adminController.verifyAdvisor,
  makeUploader("products").array("productImages", 5),
  productController.createNewProduct,
);
// Kept JSON-only: the inline status/stock controls in the table post here.
routerAdmin.post(
  "/product/:id",
  adminController.verifyAdvisor,
  productController.updateChosenProduct,
);
// The drawer's full edit, which also carries image files.
routerAdmin.post(
  "/product/:id/edit",
  adminController.verifyAdvisor,
  makeUploader("products").array("productImages", 5),
  productController.editChosenProduct,
);

/** Review routes  **/
// reviews are text-only — no uploader middleware, the form posts urlencoded
routerAdmin.get(
  "/review/all",
  adminController.verifyAdvisor,
  reviewController.getAllReviews,
);
routerAdmin.post(
  "/review/create",
  adminController.verifyAdvisor,
  reviewController.createNewReview,
);
routerAdmin.post(
  "/review/:id",
  adminController.verifyAdvisor,
  reviewController.updateChosenReview,
);

/** Tutorial routes **/
// link only — no uploader middleware, the form posts urlencoded
routerAdmin.get(
  "/tutorial/all",
  adminController.verifyAdvisor,
  tutorialController.getAllTutorials,
);
routerAdmin.post(
  "/tutorial/create",
  adminController.verifyAdvisor,
  tutorialController.createNewTutorial,
);
routerAdmin.post(
  "/tutorial/:id",
  adminController.verifyAdvisor,
  tutorialController.updateChosenTutorial,
);
routerAdmin.delete(
  "/tutorial/:id",
  adminController.verifyAdvisor,
  tutorialController.deleteTutorial,
);

/** Discount routes **/
// urlencoded form, no uploader — one row of settings for the running sale
routerAdmin.get(
  "/discount",
  adminController.verifyAdvisor,
  discountController.getDiscountPage,
);
routerAdmin.post(
  "/discount/update",
  adminController.verifyAdvisor,
  discountController.updateDiscount,
);

/** Order routes **/
routerAdmin.get(
  "/order/all",
  adminController.verifyAdvisor,
  orderController.getAllOrders,
);

routerAdmin.post(
  "/order/update",
  adminController.verifyAdvisor,
  orderController.updateOrderStatus,
);

/** User  **/
routerAdmin.get(
  "/user/all",
  adminController.verifyAdvisor,
  adminController.getUsers,
);

routerAdmin.post(
  "/user/edit",
  adminController.verifyAdvisor,
  adminController.updateChosenUser,
);

export default routerAdmin;
