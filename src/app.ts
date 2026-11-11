/**
 * Purpose:  Configures the Express app — middlewares, view engine, and routes
 * Called by: server.ts (imports and listens on this app)
 * Sends to:  router.ts (SPA) and router-admin.ts (Admin panel)
 */

import express, { NextFunction, Request, Response } from "express";
import path from "path";
import multer from "multer";
import mongoose from "mongoose";
import helmet from "helmet";
import compression from "compression";
import cors from "cors";
import router from "./router";
import routerAdmin from "./router-admin";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { MORGAN_FORMAT } from "./libs/config";

import session from "express-session";
import ConnectMongoDB from "connect-mongodb-session";
import { T } from "./libs/types/common";
import Errors, { HttpCode, Message } from "./libs/Errors";
import { reportError, sendError } from "./libs/utils/monitoring";
import { takeNotice } from "./libs/utils/notice";
import OrderModel from "./schema/Order.model";
import { OrderStatus } from "./libs/enums/order.enum";

const MongoDBStore = ConnectMongoDB(session);
const store = new MongoDBStore({
  uri: String(process.env.MONGO_URL),
  collection: "sessions",
});
// With no listener, an error here is uncaught and takes the whole shop down
// over the admin panel's sessions. Logged instead; a database that never
// comes up at all is handled by the connect in server.ts.
store.on("error", (err) => {
  console.log("Session store error", err);
  reportError(err);
});


/** 1 - CREATE THE APP **/
const app = express();

// nginx terminates HTTPS on the server and talks plain HTTP to this app, so
// without this Express reads every request as insecure and never marks the
// session cookie Secure.
app.set("trust proxy", 1);

// Comma-separated, on top of the local SPA dev server so `yarn dev` keeps
// working untouched.
const corsOrigins = [
  "http://localhost:8002",
  ...(process.env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()) ?? []),
];

app.use(cors({ origin: corsOrigins, credentials: true }));

app.use(
  helmet({
    // The SPA lives on another domain and shows product images straight from
    // here; helmet's default (same-origin) would break every one of them.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        // Only the admin pages are HTML, and they lean on inline handlers and
        // `<script>alert(...)</script>` replies, so inline scripts stay allowed
        // for now. What this still buys: scripts only from these hosts, no
        // plugins, and no framing of the admin panel by another site.
        // One host per script the admin still loads: jQuery, axios and the
        // two embeds. jsdelivr and code.jquery.com left with Bootstrap's JS,
        // Popper and the slim jQuery; esm.sh left with the anime.js splash
        // the dashboard replaced. Bootstrap's stylesheet has gone too, so
        // the admin loads no third-party CSS at all.
        "script-src": [
          "'self'",
          "'unsafe-inline'",
          "https://ajax.googleapis.com",
          "https://unpkg.com",
          "https://www.youtube.com",
          "https://www.instagram.com",
        ],
        "script-src-attr": ["'unsafe-inline'"],
        "img-src": ["'self'", "data:", "blob:", "https:"],
        "frame-src": ["https://www.youtube.com", "https://www.instagram.com"],
        "connect-src": ["'self'", "https://www.instagram.com"],
        "frame-ancestors": ["'none'"],
        // nginx serves HTTPS and HSTS keeps browsers there; forcing upgrades
        // here would only break the admin panel over local http.
        "upgrade-insecure-requests": null,
      },
    },
  }),
);
// JSON and pages shrink to a fraction over the wire — product lists most of
// all. Images are skipped; they are compressed already.
app.use(compression());

// For health checks (the deploy job calls it after every release): healthy
// only while the database is reachable, since without it every page fails
// anyway.
app.get("/health", (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  res.status(ok ? HttpCode.OK : 503).json({ status: ok ? "ok" : "unavailable" });
});

app.use(express.static(path.join(__dirname, "public")));
// Payment screenshots carry bank details, so they are never served from the
// open folder — only through the advisor-checked route in router-admin.ts.
// Product and profile images stay public.
app.use("/uploads/orders", (req, res) => {
  res.sendStatus(HttpCode.NOT_FOUND);
});
const uploadOptions = {
  // Every upload gets a fresh random name and is never rewritten — an edit
  // saves a new file under a new name — so browsers may keep each one for
  // good and skip asking again on the next visit.
  maxAge: "365d",
  immutable: true,
  // Belt and braces for files saved before uploads were limited to images:
  // the browser goes by the extension and never guesses a page out of one.
  setHeaders: (res: Response) => res.setHeader("X-Content-Type-Options", "nosniff"),
};
app.use(
  "/uploads",
  express.static("uploads", uploadOptions),
  // The catalog's product photos ship with the code (seed/uploads), so a
  // fresh server or a lost disk still shows them; anything the admin panel
  // uploads later lands in uploads/ above and is found first.
  express.static(path.join(__dirname, "..", "seed", "uploads"), uploadOptions),
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
// Quiet under the test runner, where a line per request buries the results.
app.use(morgan(MORGAN_FORMAT, { skip: () => process.env.NODE_ENV === "test" }));


/** 2 - SESSIONS (admin panel only) **/
// Mounted on /admin, not globally: the SPA authenticates with a JWT and never
// reads req.session, so a global mount had every anonymous shop visitor
// writing a session document to MongoDB on every request.
app.use(
  "/admin",
  session({
    secret: String(process.env.SESSION_SECRET),
    cookie: {
      maxAge: 1000 * 3600 * 6,
      // Same-origin, so "lax" is enough. "auto" rather than a hard `true`,
      // which drops the cookie entirely over local http.
      sameSite: "lax",
      secure: "auto",
    },
    store: store,
    // resave keeps an active admin's 6h session sliding forward;
    // saveUninitialized off so opening the login page leaves no row behind.
    resave: true,
    saveUninitialized: false,
  }),
);


app.use("/admin", async function (req, res, next) {
  const sessionInstance = req.session as T;
  res.locals.member = sessionInstance.member;
  // A message left by the handler that redirected here, shown once as a toast
  // and then gone — see libs/utils/notice.ts.
  res.locals.notice = takeNotice(req);

  // How many orders are waiting for a decision — the sidebar carries it on
  // every page, so the admin never has to open the list to find out. One
  // indexed count, and only once there is an admin to show it to.
  if (sessionInstance.member) {
    try {
      res.locals.waitingCount = await OrderModel.countDocuments({
        orderStatus: OrderStatus.WAITING_CONFIRMATION,
      }).exec();
    } catch (err) {
      console.log("Could not count waiting orders", err);
      res.locals.waitingCount = 0;
    }
  }
  next();
});


/** 3 - VIEWS **/
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");


/** 4 - ROUTES **/
app.use("/admin", routerAdmin);  // SSR — EJS admin pages
app.use("/", router);            // SPA — JSON API


/** 5 - ERRORS **/
// multer reports a refused file through next(err), which Express would answer
// with a bare 500 page. The SPA reads `message` off a JSON body, so the
// shopper is told why their screenshot was not accepted.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.log("Error on request", err);
  if (err instanceof multer.MulterError)
    err = new Errors(HttpCode.BAD_REQUEST, Message.INVALID_IMAGE_FILE);
  sendError(res, err);
});

export default app;
