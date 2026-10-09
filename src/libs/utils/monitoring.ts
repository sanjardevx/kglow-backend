import { Response } from "express";
import * as Sentry from "@sentry/node";
import Errors from "../Errors";

/**
 * Error alerts, off until SENTRY_DSN is set. Called from server.ts before
 * anything else loads, which is what Sentry needs to hook in.
 */
export function initMonitoring(): void {
  if (!process.env.SENTRY_DSN) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "production",
    // Requests carry passwords, tokens and payment screenshots; none of that
    // belongs in a third-party error report. Sentry collects all of it by
    // default, so each kind is switched off here, and beforeSend strips the
    // same fields again in case a default changes underneath us.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: {
        request: { deny: ["authorization", "cookie"] },
        response: false,
      },
    },
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });
}

/** Something we didn't expect — a bug or an outage, never a user's mistake. */
export function reportError(err: unknown): void {
  Sentry.captureException(err); // a no-op when monitoring is off
}

/**
 * The one way an API handler answers a failure. Our own Errors carry their
 * status and message; anything else is unexpected, so it is reported and the
 * shopper gets the generic message rather than the details.
 */
export function sendError(res: Response, err: unknown): void {
  if (err instanceof Errors) {
    res.status(err.code).json(err);
    return;
  }
  reportError(err);
  res.status(Errors.standart.code).json(Errors.standart);
}
