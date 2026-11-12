# K-Glow Secrets — Backend

The API and admin panel behind **[K-Glow Secrets](https://www.kglowshop.uz)**, an online shop for original Korean skincare and makeup, based in Namangan and delivering across Uzbekistan.

| | |
|---|---|
| **Shop** (frontend, separate repo) | https://www.kglowshop.uz |
| **API** | https://api.kglowshop.uz |
| **Admin panel** | https://admin.kglowshop.uz |
| **Frontend repo** | [`sanjardev23/k-glow-react`](https://github.com/sanjardev23/k-glow-react) |

---

## How it fits together

```
 Shopper's browser                         Shop owner
        │                                       │
        ▼                                       ▼
 www.kglowshop.uz  (React, Vercel)      admin.kglowshop.uz
        │   JSON over HTTPS                     │  server-rendered pages
        ▼                                       ▼
 ┌──────────────────────── AWS Lightsail (Seoul) ────────────────────────┐
 │  nginx  ──►  Express app (this repo, run by pm2)                       │
 │                 ├─ /member, /product, /order, /ai …   JSON API         │
 │                 ├─ /admin …                            EJS admin panel  │
 │                 └─ /uploads …                          product photos   │
 └────────────────────────────────────────────────────────────────────────┘
        │                         │                         │
        ▼                         ▼                         ▼
  MongoDB Atlas            Anthropic (Claude)          Google sign-in
  (all shop data)          (AI Beauty answers)         (verifies tokens)
```

One Express app serves three things: the **JSON API** the shop calls, the **admin panel** (server-rendered with EJS), and **uploaded images**. nginx in front terminates HTTPS and forwards both `api.` and `admin.` to the same app.

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Node.js 22+, TypeScript |
| Web | Express 4, EJS (admin pages) |
| Database | MongoDB Atlas via Mongoose 6 |
| Auth | JWT (shop, `Authorization: Bearer`), sessions in MongoDB (admin), Google Identity |
| Validation | Zod |
| Security | Helmet (CSP, HSTS), CORS allow-list, rate limits, bcrypt |
| AI | Anthropic SDK — Claude Haiku 5.5, structured output |
| Tests | Vitest + Supertest + mongodb-memory-server |
| Hosting | AWS Lightsail, nginx, Let's Encrypt, pm2 |
| CI/CD | GitHub Actions |

## Features

- **Shop API** — sign up / log in (password or Google), catalog with search, filters and sorting, product views, reviews, tutorials, the running discount, orders with payment-receipt upload.
- **Admin panel** — dashboard, orders (confirm / reject), products (search, category, status, stock filters), reviews, tutorials, discount, users.
- **AI Beauty** — a skin quiz that returns a morning and evening routine, plus a short chat. It only ever recommends products that are **in stock**, members only, **5 answers per member per day**.
- **Nightly database backup** with a restore script.
- **Automatic deploy** on every push to `develop` that passes the tests.

---

## Getting started

### 1. Prerequisites

- **Node.js 22 or newer** (`node -v`)
- A **MongoDB** connection string (MongoDB Atlas, or a local MongoDB)

### 2. Install and configure

```bash
git clone https://github.com/sanjardev23/kglow-backend.git
cd kglow-backend
npm ci
```

Create a `.env` file in the project root (see [Environment variables](#environment-variables)). The minimum to start:

```env
MONGO_URL=mongodb+srv://<user>:<password>@<cluster>/kglow
SESSION_SECRET=<a long random string>
SECTER_TOKEN=<another long random string>
PORT=3004
```

### 3. Run

```bash
npm run start:dev      # development, restarts on save
```

The API is now on `http://localhost:3004` and the admin panel on `http://localhost:3004/admin`.

### 4. Create the admin account

Open `http://localhost:3004/admin/signup` once. The **first** account created there becomes the shop's only admin; the signup page refuses any further admins.

---

## Environment variables

`.env` is never committed. Only the first three are required — the server refuses to start without them.

| Variable | Required | What it is |
|---|---|---|
| `MONGO_URL` | ✅ | MongoDB connection string |
| `SESSION_SECRET` | ✅ | Signs admin panel session cookies |
| `SECTER_TOKEN` | ✅ | Signs shop login tokens (JWT). *(The spelling is historical — keep it.)* |
| `PORT` | | Port to listen on. Default `8001`; production uses `3000` |
| `CORS_ORIGINS` | | Comma-separated sites allowed to call the API, e.g. `https://www.kglowshop.uz,https://kglowshop.uz` |
| `ANTHROPIC_API_KEY` | | Turns on AI Beauty. Without it AI Beauty answers "not set up yet" |
| `GOOGLE_CLIENT_ID` | | Turns on Google sign-in (OAuth **Client ID**, not the secret) |
| `SENTRY_DSN` | | Optional error alerts to Sentry |
| `NODE_ENV` | | Set by the test runner; leave unset in production |

## Scripts

| Command | What it does |
|---|---|
| `npm run start:dev` | Run locally with auto-restart (ts-node + nodemon) |
| `npm run build` | Compile to `dist/` and copy the admin views and assets |
| `npm start` | Run the compiled build (`dist/server.js`) — what production runs |
| `npm test` | Run the whole test suite (starts its own throwaway MongoDB) |
| `npm run typecheck` | Type-check without building |

---

## Project structure

```
src/
  server.ts            entry point: checks env, connects to MongoDB, starts listening
  app.ts               Express setup: security headers, CORS, static files, sessions, routes
  router.ts            shop API routes   (/member, /product, /order, /ai, …)
  router-admin.ts      admin panel routes (/admin/…)
  controllers/         read the request, call a service, send the response
  models/              services — the business logic (orders, AI Beauty, products, …)
  schema/              Mongoose models (one file per collection)
  libs/
    validation.ts      every request body / query, as Zod schemas
    Errors.ts          HTTP codes and the user-facing error messages
    utils/             uploads, rate limits, Google token check, monitoring, paging
  views/               EJS templates for the admin panel
  public/              admin panel CSS and JS
seed/uploads/          the catalog's product photos, shipped with the code
scripts/
  deploy.sh            server-side update script (run by CI)
  backup-db.cjs        copies the whole database to JSON files
  restore-db.cjs       puts a backup back
test/                  API tests, one file per area
.github/workflows/     ci.yml (test + deploy), backup.yml (nightly backup)
```

The flow for every request is the same: **router → controller → service (`models/`) → Mongoose model (`schema/`)**. Inputs are validated with Zod in the controller before anything touches the database.

## API at a glance

All responses are JSON. Routes marked 🔒 need `Authorization: Bearer <token>` (the token comes from login).

| Method | Path | What it does |
|---|---|---|
| POST | `/member/signup` · `/member/login` | Create an account / log in → returns a token |
| POST | `/member/google` | Log in with a Google credential |
| GET 🔒 | `/member/detail` | The signed-in member |
| POST 🔒 | `/member/update` | Update profile (multipart, optional photo) |
| GET | `/product/all` | Catalog: `page`, `limit` (max 100), `order`, `productCategory`, `search` |
| GET | `/product/:id` | One product (counts a view for signed-in members) |
| GET | `/review/all` · `/tutorial/all` · `/discount/active` | Reviews, tutorials, the running sale |
| POST 🔒 | `/order/create` | Place an order (multipart, with payment receipt photos) |
| GET 🔒 | `/order/all` | The member's orders |
| GET 🔒 | `/ai/status` | AI answers left today and the saved routine |
| POST 🔒 | `/ai/routine` · `/ai/chat` | AI Beauty quiz / chat |
| GET | `/health` | `{"status":"ok"}` while the database is reachable |

## AI Beauty

Lives in [`src/models/Beauty.service.ts`](src/models/Beauty.service.ts).

- **Model:** Claude **Haiku 5.5** with structured (JSON) output, so answers are parsed, never scraped.
- **Grounded in stock:** the in-stock catalog is sent with each request, and every product id Claude returns is checked against it — made-up or out-of-stock products are dropped.
- **Cost control:** 5 answers per member per day (counted in MongoDB, so restarts don't reset it), plus a per-address rate limit. The catalog is prompt-cached. A typical answer costs well under 1¢.
- **Languages:** Uzbek (Latin), Russian, English. Uzbek answers are checked for stray Cyrillic and apostrophes are normalised (`oʻ`, `gʻ`, `ʼ`).
- To change the daily limit, edit `DAILY_LIMIT` in that file.

## Product photos

Catalog photos are committed in `seed/uploads/products/` and served at `/uploads/products/…`, so a fresh server always has them. Photos uploaded later from the admin panel go to `uploads/` (not committed) and take priority. Payment receipts in `uploads/orders/` are **never** public — only the admin panel can open them.

---

## Testing

```bash
npm test
```

Each test file starts its own in-memory MongoDB, so no database or secrets are needed. Claude and Google are mocked. The suite covers auth, the catalog, orders and totals, security headers and uploads, Google sign-in, and AI Beauty (limits, stock checks, language rules).

## Deployment

Pushing to **`develop`** is the whole release process:

1. **GitHub Actions** (`ci.yml`) installs, type-checks, builds and runs every test.
2. If everything passes, it connects to the Lightsail server over SSH and runs [`scripts/deploy.sh`](scripts/deploy.sh): `git pull` → `npm ci` → `npm run build` → `pm2 restart kglow-api`.
3. It then calls `https://api.kglowshop.uz/health` and fails the run if the API doesn't come back.

The SSH key used by CI can only run that one script (it is locked to it in the server's `authorized_keys`).

**Server facts:** Ubuntu on AWS Lightsail (Seoul), app in `~/kglow`, process `kglow-api` in pm2, nginx site `/etc/nginx/sites-available/kglowshop`, HTTPS certificates from Let's Encrypt that renew themselves.

Useful commands on the server:

```bash
pm2 status                         # is the API running?
pm2 logs kglow-api --lines 100     # recent logs
bash ~/kglow/scripts/deploy.sh     # deploy by hand
```

After changing `~/kglow/.env` on the server, apply it with `pm2 restart kglow-api --update-env`.

## Backups

`backup.yml` runs **every night at 03:00 Tashkent time**: it copies every collection to Extended JSON, compresses it, and keeps it for **30 days** as a download on the workflow run page (GitHub → Actions → *Database backup*). It needs the `MONGO_URL` repository secret. Run it any time with **Run workflow**.

To restore, download and unpack a backup, then:

```bash
MONGO_URL=... node scripts/restore-db.cjs ./kglow-2026-11-12_0300            # dry run: lists what it would do
MONGO_URL=... node scripts/restore-db.cjs ./kglow-2026-11-12_0300 products --yes   # restore only products
```

A restored collection is emptied first, then refilled exactly as it was. Safer habit: restore into an empty database first, check it, then into the live one.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Server exits with "Missing environment variables" | `MONGO_URL`, `SESSION_SECRET` or `SECTER_TOKEN` is not set |
| Shop shows CORS errors in the browser console | The shop's address is missing from `CORS_ORIGINS` |
| AI Beauty says "isn't set up yet" | `ANTHROPIC_API_KEY` is not set |
| Google sign-in says "isn't set up yet" | `GOOGLE_CLIENT_ID` is not set (or the server wasn't restarted with `--update-env`) |
| A deploy run fails at "Check the API answers" | The app didn't start — check `pm2 logs kglow-api` on the server |

## Contributing

Work on `develop`. Commit messages are one line, `feat:` for something new and `fix:` for changing something that exists, e.g. `feat: develop admin product filters`. Run `npm run typecheck && npm test` before pushing — CI runs the same and won't deploy a failing build.
