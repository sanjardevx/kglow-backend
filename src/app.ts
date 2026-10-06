/**
 * Purpose:  Configures the Express app — middlewares, view engine, and routes
 * Called by: server.ts (imports and listens on this app)
 * Sends to:  router.ts (SPA) and router-admin.ts (Admin panel)
 */

import express, { NextFunction, Request, Response } from "express";
import path from "path";
import multer from "multer";
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

const MongoDBStore = ConnectMongoDB(session);
const store = new MongoDBStore({
  uri: String(process.env.MONGO_URL),
  collection: "sessions",
});


/** 1 - CREATE THE APP **/
const app = express();

// Railway terminates HTTPS itself and talks plain HTTP to this server, so
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
app.use(express.static(path.join(__dirname, "public")));
// Payment screenshots carry bank details, so they are never served from the
// open folder — only through the advisor-checked route in router-admin.ts.
// Product and profile images stay public.
app.use("/uploads/orders", (req, res) => {
  res.sendStatus(HttpCode.NOT_FOUND);
});
app.use(
  "/uploads",
  express.static("uploads", {
    // Belt and braces for files saved before uploads were limited to images:
    // the browser goes by the extension and never guesses a page out of one.
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan(MORGAN_FORMAT));


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


app.use("/admin", function (req, res, next) {
  const sessionInstance = req.session as T;
  res.locals.member = sessionInstance.member;
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
  if (err instanceof Errors) res.status(err.code).json(err);
  else res.status(Errors.standart.code).json(Errors.standart);
});

export default app;
