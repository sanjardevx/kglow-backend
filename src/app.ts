/**
 * Purpose:  Configures the Express app — middlewares, view engine, and routes
 * Called by: server.ts (imports and listens on this app)
 * Sends to:  router.ts (SPA) and router-admin.ts (Admin panel)
 * Flow:     Request → middlewares (json, urlencoded, morgan) → router
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

// A reverse proxy (Railway, Vercel, etc.) terminates HTTPS itself and talks
// plain HTTP to this server — without this, Express sees every request as
// insecure and silently refuses to set the `secure: true` session cookie
// below at all. `trust proxy` makes it read the proxy's X-Forwarded-Proto
// header instead of the raw (local, HTTP) connection.
app.set("trust proxy", 1);

// CORS_ORIGINS — comma-separated list, e.g. for a temporary Vercel preview
// deployed while this backend stays local (via ngrok). Always includes the
// local dev server so `yarn dev` on the SPA keeps working untouched.
const corsOrigins = [
  "http://localhost:8002",
  ...(process.env.CORS_ORIGINS?.split(",").map((origin) => origin.trim()) ?? []),
];

app.use(
  cors({ origin: corsOrigins, credentials: true }),
); // allows the React SPA (dev server, different port) to call this API
app.use(express.static(path.join(__dirname, "public")));  // serves static files (images, css, js) from /public folder
app.use("/uploads", express.static("uploads"));           // serves static files (images, css, js) from /uploads folder
app.use(express.urlencoded({ extended: true }));          // lets express read data sent from HTML forms
app.use(express.json());                                  // lets express read JSON data sent from React/API
app.use(cookieParser());                                  // lets express read cookies
app.use(morgan(MORGAN_FORMAT));                           // logs every request in terminal (method, url, status, time)


/** 2 - SESSIONS (admin panel only) **/
// Mounted on /admin rather than globally: the SPA authenticates with a JWT and
// never reads req.session, so a global mount meant every anonymous shop
// visitor — every product listing, every page view — created and wrote a
// session document to MongoDB. Scoped here, only the handful of admin requests
// touch the store. `saveUninitialized: false` then stops even a visitor who
// merely lands on the admin login page from leaving a row behind; admin login
// sets req.session.member and calls save() explicitly, so it is unaffected.
// `resave: true` stays, because it is what keeps an active admin's 6h session
// sliding forward instead of expiring mid-shift.
app.use(
  "/admin",
  session({
    secret: String(process.env.SESSION_SECRET),
    cookie: {
      maxAge: 1000 * 3600 * 6,       // cookies will be active 6h
      // The admin panel is served by this same server, so its cookie is
      // first-party and "lax" is enough — no third-party-cookie blocking to
      // work around here. `secure: true` still works on http://localhost
      // (browsers treat it as a trustworthy origin), so local dev is fine.
      sameSite: "lax",
      secure: true,
    },
    store: store,
    resave: true,                   // save session every request (false = save only when changed)
    saveUninitialized: false,
  }),
);


app.use("/admin", function (req, res, next) {
  const sessionInstance = req.session as T;
  res.locals.member = sessionInstance.member;
  next();
});


/** 3 - VIEWS **/
app.set("views", path.join(__dirname, "views")); // tells express where the EJS template files live
app.set("view engine", "ejs");         // sets EJS as the HTML engine (used only for admin pages)


/** 4 - ROUTES **/
app.use("/admin", routerAdmin);  // SSR   /admin/* → admin router (server-side EJS pages)
app.use("/", router);            // SPA   /* → main router (React single page app)

export default app;
