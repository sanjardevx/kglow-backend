/**
 * Purpose:  Entry point — connects to MongoDB, then starts the Express server
 * Flow:     node server.ts → MongoDB connects → app.listen() → ready
 */

import dotenv from "dotenv";
dotenv.config();

// Checked before app.ts loads, because it reads them at import time. Missing,
// they don't fail loudly: sessions and tokens get signed with the literal
// string "undefined", which anyone can guess.
const REQUIRED_ENV = ["MONGO_URL", "SESSION_SECRET", "SECTER_TOKEN"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(`Missing environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

// Before the app loads, so Sentry can hook into what it imports.
import { initMonitoring } from "./libs/utils/monitoring";
initMonitoring();

import mongoose from "mongoose";
import app from "./app";

// Already mongoose 6's behaviour (filters ignore fields the schema doesn't
// know); set explicitly so the upgrade to 7, which flips it, can't loosen it.
mongoose.set("strictQuery", true);

mongoose
  .connect(process.env.MONGO_URL as string)
  .then((data) => {
    console.log("MongoDB connection succeed");
    const PORT = process.env.PORT ?? 8001;
    const server = app.listen(PORT, function () {
      console.log(`The server is running successfully on port: ${PORT}`);
      console.log(`Admin project on http://localhost:${PORT}/admin \n`);
    });

    // pm2 stops the app with a signal on every restart (each deploy).
    // Finishing the requests already in flight means a checkout isn't cut
    // off halfway through its transaction.
    const shutdown = (signal: string) => {
      console.log(`${signal} received, shutting down`);
      server.close(() => {
        mongoose.disconnect().finally(() => process.exit(0));
      });
      // Keep-alive connections can hold close() open; don't wait forever.
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.log("ERROR on connection MongoDB", err);
    // Exiting lets pm2 restart us; staying up would leave a process that
    // looks alive but never listens.
    process.exit(1);
  });


// MySQL   → uses Tables
// MongoDB → uses Collections (mongoose calls them "models")
