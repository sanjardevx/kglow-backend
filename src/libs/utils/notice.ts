/**
 * One-shot messages carried across an admin redirect.
 *
 * The form endpoints used to answer with
 *   `<script>alert("${message}"); window.location.replace('/admin/...')</script>`
 * which meant a browser alert instead of the panel's own toast, a page the
 * CSP has to allow inline scripts for, and a message interpolated straight
 * into a JavaScript string literal — a quote in it breaks the page, and
 * anything echoed back from input is running code.
 *
 * The message now rides in the session instead: the handler stores it and
 * redirects, the next render hands it to the page, and the page shows it as a
 * toast. Nothing of it ever reaches a script.
 */
import { Request, Response } from "express";
import { Session } from "express-session";

export type NoticeKind = "good" | "bad";

export interface Notice {
  kind: NoticeKind;
  message: string;
}

type WithNotice = Session & { notice?: Notice };

/** Stores the message and sends the admin on. The session is saved first:
 *  without that the redirect can arrive before the store has the write. */
export function redirectWithNotice(
  req: Request,
  res: Response,
  to: string,
  kind: NoticeKind,
  message: string,
): void {
  (req.session as WithNotice).notice = { kind, message };
  req.session.save(() => res.redirect(to));
}

/** Hands the pending message to the next render and clears it, so a reload
 *  does not show it a second time. */
export function takeNotice(req: Request): Notice | undefined {
  const session = req.session as WithNotice | undefined;
  const notice = session?.notice;
  if (session) delete session.notice;
  return notice;
}
