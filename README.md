# BooksExams TZ — Online Books & Exams Selling/Renting Platform

Stack: **Express.js** (API + server-rendered pages), **Pug** (views), **Sequelize + mysql2** (MySQL ORM), **JWT** auth (+ **Google Sign-In**), **express-rate-limit** (per-IP throttling), a **Tanzania mobile money** payment layer (Vodacom M-Pesa / Mixx by Yas), and a **protected canvas-based reader** (pdf.js) for viewing purchased resources.

## Features implemented

- Public home page listing all book categories and exam year-series created by the admin.
- Anyone can browse book/exam titles, prices and covers without an account.
- **Viewing an individual book/exam's detail page requires login** (register/login gate).
- **Reading the actual file requires payment** — enforced server-side via a `Purchase` record checked on every stream/download request, independent of the UI.
- Sign in/register with **email+password or Google** (Google Identity Services + `google-auth-library` token verification).
- **Forgot/reset password** via emailed link (1-hour expiry, single-use, hashed token) — works for both regular users and admins.
- Cart: add books/exams as **buy** or **rent**, view running total, checkout to create a priced `Order`.
- Payment: pick M-Pesa or Mixx by Yas, enter phone number, an STK/USSD push is sent; frontend polls payment status; on provider success the order is marked paid and access (`Purchase`) is auto-granted (permanent for buy, expiring for rent).
- "My Library" page — shows **only** resources the logged-in user has actually paid for and whose rental (if any) hasn't expired.
- **Resource auto-conversion**: non-PDF uploads (DOCX/DOC/PPT/PPTX/ODT/RTF/EPUB) are automatically converted to PDF via LibreOffice on upload/edit, so every resource can go through the protected reader.
- **Protected in-browser reader**: purchased resources open in a distraction-free canvas viewer (not a native browser PDF viewer) with a burned-in watermark of the viewer's name/email/timestamp, disabled right-click/copy/text-selection, and blocked common print/save/devtools keyboard shortcuts. **Read the "Content protection — realistic limits" section below** — this deters casual copying but cannot stop OS-level screenshots.
- Admin panel (separate layout/nav from the shopper-facing site): full CRUD for categories, books, and exams (view/edit/delete/publish-toggle), a live transactions table (view/edit status/delete), user management, and a dashboard with counts + revenue.
- **Super admin**: the seeded default account is a `superadmin` — the only role that can create new `admin` accounts or promote/demote a regular user to/from admin. Regular `admin` accounts manage content and transactions but can't manage other admins.
- **Pagination (10/page, capped at 50/page)** everywhere a list could grow large: public books/exams/search, and admin books/exams/categories/users/transactions — both as a JSON API contract (`{ items, pagination }`) and as rendered UI (server-rendered Prev/Next links on public pages, AJAX pagination controls in the admin panel).
- REST API for every resource (`/api/auth`, `/api/categories`, `/api/books`, `/api/exams`, `/api/cart`, `/api/orders`, `/api/payments`, `/api/library`, `/api/admin/*`).
- JWT auth (Bearer header or httpOnly cookie) for both the API and the server-rendered pages.
- Per-IP rate limiting: a global API limiter, a stricter limiter on `/api/auth/*`, and an even stricter one on `/api/payments/initiate`.
- Payment provider webhooks are protected by a shared secret (`?secret=...`), not left open to the public internet.

## Project layout

```
config/database.js         Sequelize connection (pool size configurable via env for scale)
models/                     User, Category, Book, Exam, Cart, CartItem, Order, OrderItem, Payment, Purchase
utils/paginate.js           Shared pagination helper (page/limit -> Sequelize limit/offset + response meta)
middleware/auth.js          JWT auth (API + redirect-based web variants), requireAdmin, requireSuperAdmin
middleware/rateLimiter.js   express-rate-limit configs (per IP)
middleware/upload.js        multer disk storage (resource files kept outside /public, covers inside)
services/paymentService.js  M-Pesa / Mixx by Yas API adapters, normalized response shape
services/conversionService.js  DOCX/PPT/etc -> PDF via LibreOffice headless CLI
services/emailService.js    nodemailer wrapper for password-reset emails (falls back to console log if SMTP unset)
controllers/                 business logic for each resource
routes/api/                  JSON REST API, mounted at /api/*
routes/web/                  Pug page routes, mounted at /
views/                        Pug templates (views/reader.pug is the protected viewer)
public/                       static assets (css/js) + uploaded cover images
uploads/books, uploads/exams  Private resource files (never served by static middleware)
scripts/syncDb.js            one-off: sync tables + create the default SUPER admin
```

## Setup

1. Install MySQL and create a database:
   ```sql
   CREATE DATABASE book_exam_store CHARACTER SET utf8mb4;
   ```
2. **(For resource conversion)** Install LibreOffice on the server: `apt-get install libreoffice`
   (or the smaller `libreoffice-writer libreoffice-impress` subset). Without it, non-PDF
   uploads are kept as-is and simply can't be opened in the protected reader until
   re-uploaded as a PDF — the rest of the app still works fine.
3. Copy `.env.example` to `.env` and fill in:
   - DB credentials and a strong `JWT_SECRET`
   - `GOOGLE_CLIENT_ID` if you want "Sign in with Google" (see below)
   - `SMTP_*` if you want real password-reset emails (otherwise reset links are logged to
     the server console — fine for local development)
   - M-Pesa / Mixx by Yas merchant credentials when you're ready to go live
4. Install dependencies:
   ```
   npm install
   ```
5. Create tables + the default **super admin** account:
   ```
   npm run db:sync
   ```
   This prints a login (`admin@example.com` / `ChangeMe123!`) — **change the password
   immediately** via the "Forgot password" flow (or add a change-password UI). This account
   can create additional admin accounts under **Admin → Users**.
6. Start the app:
   ```
   npm run dev    # with nodemon
   # or
   npm start
   ```
7. Visit `http://localhost:3000`. Log in as the super admin, create a few categories under
   **Admin → Categories**, then upload books/exams under **Admin → Books/Papers → Upload**.

## Google Sign-In setup

1. Go to https://console.cloud.google.com/apis/credentials, create an **OAuth 2.0 Client ID**
   of type "Web application".
2. Add your site's URL (e.g. `http://localhost:3000` and your production domain) under
   **Authorized JavaScript origins**.
3. Copy the Client ID into `GOOGLE_CLIENT_ID` in `.env`. No client secret is needed — the
   frontend uses Google Identity Services to get an ID token, and the backend verifies it
   server-side against Google's public certs via `google-auth-library`.
4. If `GOOGLE_CLIENT_ID` is left blank, the Google button simply doesn't render — email/password
   auth keeps working normally.

Google sign-in also handles registration automatically: a brand-new Google email creates an
account on first sign-in; an existing local account with a matching (Google-verified) email
gets Google linked to it automatically.

## Payments — important notes

`services/paymentService.js` implements the commonly documented integration pattern for:

- **Vodacom M-Pesa Tanzania Open API** (RSA-encrypted session key → C2B single-stage push)
- **Mixx by Yas / Tigo Pesa** (OAuth2 client-credentials → collections `requesttopay`)

Both providers only give you their exact field names, signing rules and sandbox URLs once
you register as a merchant on their developer portals. Before going live:

1. Register as a merchant with Vodacom and/or Yas/Tigo and obtain sandbox credentials.
2. Confirm the exact request/response JSON shape from their current docs and adjust
   `paymentService.js` and the two callback handlers in `paymentController.js` if needed.
3. Fill in all `MPESA_*` / `MIXBYYAS_*` values in `.env`, **including** `MPESA_CALLBACK_SECRET`
   / `MIXBYYAS_CALLBACK_SECRET` — the webhook endpoints reject any request that doesn't include
   the matching secret, so a stranger can't POST a fake "payment succeeded" callback.
4. Expose your `/api/payments/callback/mpesa` and `/api/payments/callback/mixbyyas`
   webhook URLs publicly (e.g. via a domain + reverse proxy, or a tunnel like ngrok while
   testing) and register them with each provider, including the `?secret=...` query param.

Until real credentials are configured, payment initiation will fail gracefully with a
JSON error — everything else in the app (browsing, cart, checkout, admin) works fully
without payments configured.

## Content protection — realistic limits (please read)

The protected reader (`views/reader.pug` + `public/js/reader.js`) implements every
reasonable **browser-level** deterrent against casual copying:

- Resources render page-by-page onto a `<canvas>` (not a native PDF viewer, not selectable
  text) — there's no built-in "download"/"print" button because there's no PDF plugin UI at all.
- Right-click, drag-to-save, text selection, and the `copy` event are all blocked inside the reader.
- Common shortcuts (Ctrl/Cmd+P, Ctrl/Cmd+S, Ctrl/Cmd+U, DevTools shortcuts, F12) are
  intercepted and blocked.
- Every rendered page has a semi-transparent watermark of the viewer's name, email, and a
  timestamp **burned into the pixel data** (not a removable CSS overlay), so any leaked copy
  is traceable back to who viewed it.
- The `@media print` stylesheet blanks the page content if printing is forced anyway.
- The streaming endpoint (`/api/books/:id/stream`) sends `Cache-Control: no-store` and
  `Content-Disposition: inline` so the browser doesn't offer a native download prompt or cache
  the file to disk the way a normal PDF link would.

**What this cannot do:** no web page can prevent operating-system-level screenshots, screen
recording, a phone camera pointed at the screen, or a sufficiently technical user reading the
raw network response in browser DevTools. That is a hard limitation of the web platform, not
a bug in this implementation — any product that claims otherwise is overstating what's
possible. What's implemented here raises the effort required for casual copying and makes any
leaked copy traceable via the watermark, which is the realistic ceiling for a web app.

## Scalability — 10,000+ resources, 5,000+ users

- **Pagination everywhere** (10/page default, 50/page hard cap) means list endpoints never
  load more rows than needed, regardless of catalog size.
- **Indexes** added on the columns actually filtered/sorted on: `Book`/`Exam` (`category_id`,
  `is_published`, `created_at`), `Order`/`Payment` (`user_id`, `status`, `created_at`,
  `provider_reference`), `User` (`role`, `is_active`, plus the existing unique `email` index).
- **Connection pool** size is configurable via `DB_POOL_MAX`/`DB_POOL_MIN` in `.env` (default
  max 20) — raise it if you see connection-timeout errors under concurrent load.
- Title search currently uses `LIKE '%term%'`, which is fine at moderate scale but doesn't use
  an index. At very large catalogs (tens of thousands of rows), consider adding a MySQL
  `FULLTEXT` index on `title` and switching the search queries to `MATCH ... AGAINST`.
- For read-heavy traffic at higher scale than this covers, consider adding a cache layer
  (e.g. Redis) in front of `GET /api/categories` and `GET /api/books` — they're not
  latency-sensitive to write immediately, and category counts in particular are cheap to
  cache for a minute or two.

## Security notes

- Passwords are hashed with bcrypt (10 rounds); Google-only accounts have no local password.
- Password reset tokens are stored as a SHA-256 hash (never the raw token), expire after 1
  hour, and are single-use (cleared on successful reset). The forgot-password endpoint always
  returns the same generic response whether or not the email exists, to prevent account enumeration.
- JWTs are signed with `JWT_SECRET` and can be sent as `Authorization: Bearer <token>` or
  stored in an httpOnly cookie (both are supported by the same middleware).
- Resource files live in `uploads/books` and `uploads/exams`, **outside** `public/`, reachable
  only through access-controlled routes that re-check the `Purchase` table (and rent expiry)
  on every request.
- Only a `superadmin` can create new admin accounts or change anyone's role — a regular
  `admin` account cannot escalate itself or anyone else.
- All `/api/*` traffic passes through a global per-IP rate limiter; auth and payment
  endpoints have additional, stricter per-IP limits to slow down brute-force/abuse.
- Payment provider webhooks require a shared secret; without it they return 401 rather than
  processing the (potentially forged) callback.
- `app.set('trust proxy', 1)` is set so `req.ip` (used as the rate-limit key) reflects the
  real client IP when deployed behind a reverse proxy — adjust the trust-proxy value to
  match your actual deployment topology.

## Suggested next steps

- Add Sequelize migrations (currently uses `sync({ alter: true })` for simplicity — fine
  for development, not for production schema changes).
- Add a "change password" UI for logged-in users (currently only forgot/reset via email link).
- Add refresh tokens / token revocation if you need instant logout-everywhere.
- Add a Redis cache layer if you outgrow the "moderate scale" guidance above.
- Consider signed, short-lived stream URLs instead of session-cookie auth alone, if you want
  the reader to work in contexts where cookies aren't sent (e.g. an embedded webview).
