import { NextFunction, Request, Response } from "express";
import { T } from "../libs/types/common";
import MemberService from "../models/Member.service";
import {
  ExtendenRequest,
  LoginInput,
  Member,
  MemberInput,
  MemberUpdateInput,
} from "../libs/types/member";
import Errors, { HttpCode, Message } from "../libs/Errors";
import AuthService from "../models/Auth.service";
import { AUTH_TIMER } from "../libs/config";
import jwt from "jsonwebtoken";
import { MemberType } from "../libs/enums/member.enum";
import {
  loginInput,
  memberUpdateInput,
  parseInput,
  signupInput,
} from "../libs/validation";
import { sendError } from "../libs/utils/monitoring";

const memberService = new MemberService();
const authService = new AuthService();

const memberController: T = {};

/**
 * Pulls the JWT out of a request.
 *
 * The SPA (Vercel) and this API (Railway) sit on different domains, which
 * makes the `accessToken` cookie a third-party cookie: Safari, every iOS
 * browser and Chrome's incognito window refuse to send it back, so a visitor
 * who had just signed in looked signed out on the very next request. The
 * token now rides in the Authorization header, where no such rule applies.
 * The cookie is still accepted as a fallback so anyone already carrying one
 * — and any same-origin caller — keeps working without signing in again.
 */
function extractToken(req: ExtendenRequest): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);

  return req.cookies["accessToken"];
}

memberController.signup = async (req: Request, res: Response) => {
  try {
    console.log("signup");
    // Only what the signup form actually asks for. Type, status and points
    // are the server's to decide: passing the whole body through let anyone
    // sign up as an ADVISOR and walk straight into the admin panel.
    const input: MemberInput = {
        ...parseInput(signupInput, req.body),
        memberType: MemberType.USER,
      },
      result: Member = await memberService.signup(input);
    const token = await authService.createToken(result);

    res.cookie("accessToken", token, {
      maxAge: AUTH_TIMER * 3600 * 1000,
      httpOnly: false,
      sameSite: "none",
      secure: true,
    });

    res.status(HttpCode.CREATED).json({ member: result, accessToken: token });
  } catch (err) {
    console.log("Error on signup", err);
    sendError(res, err);
  }
};

memberController.login = async (req: Request, res: Response) => {
  try {
    console.log("login");
    const input: LoginInput = parseInput(loginInput, req.body),
      result = await memberService.login(input),
      token = await authService.createToken(result);

    res.cookie("accessToken", token, {
      maxAge: AUTH_TIMER * 3600 * 1000,
      httpOnly: false,
      sameSite: "none",
      secure: true,
    });

    res.status(HttpCode.OK).json({ member: result, accessToken: token });
  } catch (err) {
    console.log("Error on login", err);
    sendError(res, err);
  }
};

memberController.logout = async (req: ExtendenRequest, res: Response) => {
  try {
    console.log("logout");
    // The attributes have to match the ones login set, or the browser treats
    // this as a different cookie and leaves the original in place. The client
    // drops its stored token either way — the cookie is only a fallback now.
    res.cookie("accessToken", null, {
      maxAge: 0,
      httpOnly: false,
      sameSite: "none",
      secure: true,
    });
    res.status(HttpCode.OK).json({ logout: true });
  } catch (err) {
    console.log("Error on login", err);
    sendError(res, err);
  }
};

memberController.getMemberDetails = async (
  req: ExtendenRequest,
  res: Response,
) => {
  try {
    console.log("getMemberDetails");
    const result = await memberService.getMemberDetails(req.member);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getMemberDetails", err);
    sendError(res, err);
  }
};

memberController.updateMember = async (req: ExtendenRequest, res: Response) => {
  try {
    console.log("updateMember");
    // Same reasoning as signup: a shopper edits their own profile, never their
    // type, status, points or password (which would be saved unhashed).
    const input: Partial<MemberUpdateInput> = parseInput(
      memberUpdateInput,
      req.body,
    );
    if (req.file) input.memberImage = req.file.path;

    const result = await memberService.updateMember(req.member, input);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on updateMember", err);
    sendError(res, err);
  }
};

memberController.getTopUsers = async (req: Request, res: Response) => {
  try {
    console.log("getTopUsers");

    const result = await memberService.getTopUsers();

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getTopUsers", err);
    sendError(res, err);
  }
};

memberController.verifyAuth = async (
  req: ExtendenRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = extractToken(req);
    // Read fresh every time: a member blocked or deleted in the admin panel
    // is out on their next request, not when their token expires.
    if (token) {
      const { _id } = authService.checkAuth(token);
      req.member = (await memberService.findActiveMember(_id)) as Member;
    }
    if (!req.member)
      throw new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);

    next();
  } catch (err) {
    console.log("Error on verifyAuth", err);
    // A malformed or expired token is a 401, and so is a member who is no
    // longer active — the SPA signs the visitor out on a 401. A database
    // failure must not be: the SPA deliberately treats a 500 as a passing
    // blip, and signing everyone out over one would be far worse.
    if (err instanceof jwt.JsonWebTokenError)
      err = new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);
    sendError(res, err);
  }
};

memberController.retrieveAuth = async (
  req: ExtendenRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = extractToken(req);
    if (token) {
      const { _id } = authService.checkAuth(token);
      const member = await memberService.findActiveMember(_id);
      if (member) req.member = member;
    }

    next();
  } catch (err) {
    console.log("Error on retrieveAuth", err);
    next();
  }
};

export default memberController;
