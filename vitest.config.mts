import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Each file runs in its own process with its own database and its own
    // copy of the app — and process.chdir(), which the helper needs, only
    // works in a child process, not a worker thread.
    pool: "forks",
    include: ["test/**/*.test.ts"],
    // The app logs every handler it enters; only show that for a failing test.
    silent: "passed-only",
    testTimeout: 30_000,
    // The first run downloads a MongoDB binary.
    hookTimeout: 180_000,
  },
});
