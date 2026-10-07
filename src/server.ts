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

import mongoose from "mongoose";
import app from "./app";

mongoose
  .connect(process.env.MONGO_URL as string)
  .then((data) => {
    console.log("MongoDB connection succeed");
    const PORT = process.env.PORT ?? 8001;
    app.listen(PORT, function () {
      console.log(`The server is running successfully on port: ${PORT}`);
      console.log(`Admin project on http://localhost:${PORT}/admin \n`);
    });
  })
  .catch((err) => console.log("ERROR on connection MongoDB", err));


// MySQL   → uses Tables
// MongoDB → uses Collections (mongoose calls them "models")
