import { NextFunction, Request, Response } from "express";
import { T } from "../libs/types/common";
import MemberService from "../models/Member.service";
import { AdminRequest, LoginInput, MemberInput } from "../libs/types/member";
import { MemberType } from "../libs/enums/member.enum";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { loginInput, parseInput } from "../libs/validation";
import { reportError, sendError } from "../libs/utils/monitoring";
import {
  ADMIN_PAGE_SIZE,
  pageFromQuery,
  pagingFor,
} from "../libs/utils/paging";
import { redirectWithNotice } from "../libs/utils/notice";
import DashboardService, { LOW_STOCK_AT } from "../models/Dashboard.service";

const memberService = new MemberService(); // create instance of the service

const dashboardService = new DashboardService();

const adminController: T = {};

/**
 * /admin — the dashboard. Signed out this is just the way to the login page:
 * there is nothing here for anyone else, and the panel's own front door used
 * to be an animation of the word "K-GLOW" with no information on it at all.
 */
adminController.goHome = async (req: AdminRequest, res: Response) => {
  try {
    console.log("goHome");
    if (req.session?.member?.memberType !== MemberType.ADVISOR)
      return res.redirect("/admin/login");

    const data = await dashboardService.getDashboard();
    res.render("dashboard", { data, lowStockAt: LOW_STOCK_AT });
  } catch (err) {
    console.log("Error on goHome", err);
    if (!(err instanceof Errors)) reportError(err);
    res.redirect("/admin/login");
  }
};

// GET /admin/signup  →  shows the signup page
adminController.getSignup = (req: Request, res: Response) => {
  try {
    console.log("getSignup");
    res.render("signup");
  } catch (err) {
    console.log("Error on getSignup", err);
    res.redirect("/admin");
  }
};

// GET /admin/login  →  shows the login page
adminController.getLogin = (req: Request, res: Response) => {
  try {
    console.log("getLogin");
    res.render("login");
  } catch (err) {
    console.log("Error on getLogin", err);
    res.redirect("/admin");
  }
};

// POST /admin/signup  →  receives signup form data, saves a new advisor to MongoDB
adminController.processSignup = async (
  req: AdminRequest,
  res: Response,
) => {
  try {
    console.log("processSignup");
    const file = req.file;

    const newMember: MemberInput = req.body; // get form data sent from the browser
    newMember.memberImage = file?.path;
    newMember.memberType = MemberType.ADVISOR; // force the type to ADVISOR
    const result = await memberService.processSignup(newMember); // call the service to save to DB
    // SESSIONS AUTHENTICATION
    req.session.member = result;
    req.session.save(function () {
      res.redirect("/admin/product/all");
    });
  } catch (err) {
    console.log("Error on processSignup", err);
    if (!(err instanceof Errors)) reportError(err);
    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;
    redirectWithNotice(req, res, "/admin/signup", "bad", message);
  }
};

// POST /admin/login  →  receives login form data and processes it
adminController.processLogin = async (
  req: AdminRequest,
  res: Response,
) => {
  try {
    console.log("processLogin");
    const input: LoginInput = parseInput(loginInput, req.body);
    const result = await memberService.processLogin(input);
    // SESSIONS AUTHENTICATION
    req.session.member = result;
    req.session.save(function () {
      res.redirect("/admin");
    });
  } catch (err) {
    console.log("Error on processLogin", err);
    if (!(err instanceof Errors)) reportError(err);
    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;
    redirectWithNotice(req, res, "/admin/login", "bad", message);
  }
};

adminController.logout = async (req: AdminRequest, res: Response) => {
  try {
    console.log("logout");
    req.session.destroy(function () {
      res.redirect("/admin");
    });
  } catch (err) {
    console.log("Error on logout", err);
    res.redirect("/admin");
  }
};

adminController.getUsers = async (req: Request, res: Response) => {
  try {
    console.log("getUsers");
    const page = pageFromQuery(req.query.page);
    const { list, total } = await memberService.getUsers(page, ADMIN_PAGE_SIZE);
    const paging = pagingFor(total, page);
    // Past the last page there is nothing to show and no way back except the
    // address bar, so send them to the end of the list instead.
    if (page > paging.pages)
      return res.redirect(`/admin/user/all?page=${paging.pages}`);

    res.render("users", { users: list, paging });
  } catch (err) {
    console.log("Error on getUsers", err);
    res.redirect("/admin/login");
  }
};

adminController.updateChosenUser = async (req: Request, res: Response) => {
  try {
    console.log("updateChosenUser");
    const result = await memberService.updateChosenUser(req.body);

    res.status(HttpCode.OK).json({ data: result });
  } catch (err) {
    console.log("Error on updateChosenUser", err);
    sendError(res, err);
  }
};

adminController.verifyAdvisor = (
  req: AdminRequest,
  res: Response,
  next: NextFunction,
) => {
  if (req.session?.member?.memberType === MemberType.ADVISOR) {
    req.member = req.session.member;
    next();
  } else {
    redirectWithNotice(req, res, "/admin/login", "bad", Message.NOT_AUTHENTICATED);
  }
};

export default adminController;
