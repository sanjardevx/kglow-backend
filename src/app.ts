/**
 * Purpose:  Configures the Express app — middlewares, view engine, and routes
 * Called by: server.ts (imports and listens on this app)
 * Sends to:  router.ts (SPA) and router-admin.ts (Admin panel)
 */

import express from "express";
import path from "path";
import cors from "cors";
import router from "./router";
import routerAdmin from "./router-admin";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { MORGAN_FORMAT } from "./libs/config";

import session from "express-session";
import ConnectMongoDB from "connect-mongodb-session";
import { T } from "./libs/types/common";

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
app.use("/uploads", express.static("uploads"));
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

export default app;
