# BooksExams TZ — Online Books & Exams Selling/Renting Platform

Stack: **Express.js** (API + server-rendered pages), **Pug** (views), **Sequelize + mysql2** (MySQL ORM), **JWT** auth, **express-rate-limit** (per-IP throttling), and a **Tanzania mobile money** payment layer (Vodacom M-Pesa / Mixx by Yas).

## Features implemented

- Public home page listing all book categories and exam year-series created by the admin.
- Anyone can browse book/exam titles, prices and covers without an account.
- **Viewing an individual book/exam's detail page requires login** (register/login gate).
- **Downloading the actual file requires payment** — enforced server-side via a `Purchase` record checked on every download request, independent of the UI.
- Cart: add books/exams as **buy** or **rent**, view running total, checkout to create a priced `Order`.
- Payment: pick M-Pesa or Mixx by Yas, enter phone number, an STK/USSD push is sent; frontend polls payment status; on provider success the order is marked paid and access (`Purchase`) is auto-granted (permanent for buy, expiring for rent).
- "My Library" page — shows **only** resources the logged-in user has actually paid for and whose rental (if any) hasn't expired.
- Admin panel: create categories (book categories / exam year-series), upload books/exams into those categories, dashboard with counts (books, exams, categories, users, paid orders, revenue) and a live transactions table, user management.
- REST API for every resource (`/api/auth`, `/api/categories`, `/api/books`, `/api/exams`, `/api/cart`, `/api/orders`, `/api/payments`, `/api/library`, `/api/admin/*`).
- JWT auth (Bearer header or httpOnly cookie) for both the API and the server-rendered pages.
- Per-IP rate limiting: a global API limiter, a stricter limiter on `/api/auth/*`, and an even stricter one on `/api/payments/initiate`.

## Project layout

```
config/database.js        Sequelize connection
models/                    User, Category, Book, Exam, Cart, CartItem, Order, OrderItem, Payment, Purchase
middleware/auth.js         JWT auth (API + redirect-based web variants) + requireAdmin
middleware/rateLimiter.js  express-rate-limit configs (per IP)
middleware/upload.js       multer disk storage (resource files kept outside /public, covers inside)
services/paymentService.js M-Pesa / Mixx by Yas API adapters, normalized response shape
controllers/                business logic for each resource
routes/api/                 JSON REST API, mounted at /api/*
routes/web/                 Pug page routes, mounted at /
views/                       Pug templates
public/                      static assets (css/js) + uploaded cover images
uploads/books, uploads/exams Private resource files (never served by static middleware)
scripts/syncDb.js           one-off: sync tables + create a default admin
```

## Setup

1. Install MySQL and create a database:
   ```sql
   CREATE DATABASE book_exam_store CHARACTER SET utf8mb4;
   ```
2. Copy `.env.example` to `.env` and fill in your DB credentials, a strong `JWT_SECRET`,
   and — when you're ready to go live — your M-Pesa / Mixx by Yas merchant credentials.
3. Install dependencies:
   ```
   npm install
   ```
4. Create tables + a default admin account:
   ```
   npm run db:sync
   ```
   This prints a default admin login (`admin@example.com` / `ChangeMe123!`) — **change the
   password immediately** after your first login (there's no "change password" UI yet;
   easiest is to update it directly via the DB with a bcrypt hash, or add a quick admin
   endpoint).
5. Start the app:
   ```
   npm run dev    # with nodemon
   # or
   npm start
   ```
6. Visit `http://localhost:3000`. Log in as the admin, create a few categories under
   **Admin → Manage Categories**, then upload books/exams under **Admin → Upload Book/Exam**.

## Payments — important notes

`services/paymentService.js` implements the commonly documented integration pattern for:

- **Vodacom M-Pesa Tanzania Open API** (RSA-encrypted session key → C2B single-stage push)
- **Mixx by Yas / Tigo Pesa** (OAuth2 client-credentials → collections `requesttopay`)

Both providers only give you their exact field names, signing rules and sandbox URLs once
you register as a merchant on their developer portals. Before going live:

1. Register as a merchant with Vodacom and/or Yas/Tigo and obtain sandbox credentials.
2. Confirm the exact request/response JSON shape from their current docs and adjust
   `paymentService.js` and the two callback handlers in `paymentController.js` if needed.
3. Fill in all `MPESA_*` / `MIXBYYAS_*` values in `.env`.
4. Expose your `/api/payments/callback/mpesa` and `/api/payments/callback/mixbyyas`
   webhook URLs publicly (e.g. via a domain + reverse proxy, or a tunnel like ngrok while
   testing) and register them with each provider.

Until real credentials are configured, payment initiation will fail gracefully with a
JSON error — everything else in the app (browsing, cart, checkout, admin) works fully
without payments configured.

## Security notes

- Passwords are hashed with bcrypt (10 rounds) via a Sequelize `beforeCreate`/`beforeUpdate` hook.
- JWTs are signed with `JWT_SECRET` and can be sent as `Authorization: Bearer <token>` or
  stored in an httpOnly cookie (both are supported by the same middleware).
- Resource files live in `uploads/books` and `uploads/exams`, **outside** `public/`, so they
  can only ever reach a user through `GET /api/books/:id/download` / `.../exams/:id/download`,
  both of which re-check the `Purchase` table (and rent expiry) on every request.
- All `/api/*` traffic passes through a global per-IP rate limiter; auth and payment
  endpoints have additional, stricter per-IP limits to slow down brute-force/abuse.
- `app.set('trust proxy', 1)` is set so `req.ip` (used as the rate-limit key) reflects the
  real client IP when deployed behind a reverse proxy — adjust the trust-proxy value to
  match your actual deployment topology.

## Suggested next steps

- Add Sequelize migrations (currently uses `sync({ alter: true })` for simplicity — fine
  for development, not for production schema changes).
- Add a "forgot / change password" flow.
- Add refresh tokens / token revocation if you need instant logout-everywhere.
- Add pagination to `/api/books`, `/api/exams`, `/api/admin/transactions` for large catalogs.
