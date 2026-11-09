import { Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import Errors, { HttpCode, Message } from "../Errors";

const MINUTE = 60 * 1000;

const tooMany = new Errors(HttpCode.TOO_MANY_REQUESTS, Message.TOO_MANY_ATTEMPTS);

/**
 * Counted per IP. Mobile carriers put many shoppers behind one address, so
 * the shop login only counts failed attempts: someone typing their own
 * password right never gets near the limit, a password-guessing script does.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany,
});

// Every signup counts — this is what stops a script filling the members list.
export const signupLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany,
});

/**
 * Each AI Beauty routine is a paid call to Claude, so a visitor gets a
 * handful an hour — plenty to try a few answers, too few to run up a bill.
 * Only routines actually delivered count: a quiz the server turned away, or
 * a call that failed, shouldn't use up the shopper's tries.
 */
export const aiRoutineLimiter = rateLimit({
  windowMs: 60 * MINUTE,
  limit: 6,
  skipFailedRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooMany,
});

/**
 * The admin forms answer a wrong password with a 200 and an alert, so there
 * is no failure status to count on — every attempt counts instead, which one
 * advisor never comes close to. Answered by re-rendering the login page with
 * the reason as a toast, so the 429 is kept rather than traded for a redirect.
 */
export const adminAuthLimiter = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    res
      .status(HttpCode.TOO_MANY_REQUESTS)
      .render("login", {
        notice: { kind: "bad", message: Message.TOO_MANY_ATTEMPTS },
      });
  },
});
