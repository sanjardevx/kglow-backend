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
    const input: MemberInput = req.body,
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
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

memberController.login = async (req: Request, res: Response) => {
  try {
    console.log("login");
    const input: LoginInput = req.body,
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
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
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
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
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
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

memberController.updateMember = async (req: ExtendenRequest, res: Response) => {
  try {
    console.log("updateMember");
    const input: MemberUpdateInput = req.body;
    if (req.file) input.memberImage = req.file.path;

    const result = await memberService.updateMember(req.member, input);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on updateMember", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

memberController.getTopUsers = async (req: Request, res: Response) => {
  try {
    console.log("getTopUsers");

    const result = await memberService.getTopUsers();

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getTopUsers", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

memberController.verifyAuth = async (
  req: ExtendenRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = extractToken(req);
    if (token) req.member = await authService.checkAuth(token);
    if (!req.member)
      throw new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);

    next();
  } catch (err) {
    console.log("Error on verifyAuth", err);
    // A malformed or expired token throws a JsonWebTokenError, which is not
    // one of ours and used to fall through to the catch-all 500. Nothing else
    // in here talks to the database, so the only other thing that can land
    // here is the Errors we raise above — meaning every non-Errors failure is
    // simply "this token is no good". Saying so with a 401 matters to the
    // SPA, which signs the visitor out on a 401 and deliberately ignores a
    // 500 as a server-side blip: left as a 500, an expired session would
    // never clear itself and every later request would quietly fail.
    if (!(err instanceof Errors))
      err = new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

memberController.retrieveAuth = async (
  req: ExtendenRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = extractToken(req);
    if (token) req.member = await authService.checkAuth(token);

    next();
  } catch (err) {
    console.log("Error on retrieveAuth", err);
    next();
  }
};

export default memberController;
