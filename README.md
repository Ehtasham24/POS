# POS System

**A multi-tenant, offline-capable Point-of-Sale platform built for the way small and mid-sized retail shops actually operate — not the way enterprise POS vendors assume they do.**

One codebase runs many independent shops on a shared database, each shop fully isolated from the others, with a platform-level admin console to manage, monitor, and bill them. A single shop can run entirely offline through a power or internet outage and sync automatically the moment it reconnects. Bank-transfer payments confirm themselves from a forwarded SMS. Customer credit ("udhaar") is tracked as a real, auditable ledger instead of a notebook.

---

## Table of Contents

- [The Problem](#the-problem)
- [What Makes This Different](#what-makes-this-different-from-a-conventional-pos)
- [Core Features](#core-features)
- [Subscription Tiers](#subscription-tiers)
- [Technology Stack](#technology-stack)
- [Architecture at a Glance](#architecture-at-a-glance)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)

---

## The Problem

Most POS software is built for one of two extremes: a single, well-connected storefront with a card reader, or a large enterprise chain with an IT department behind it. Small and mid-sized retail businesses — the kind that make up most of the market in Pakistan and similar economies — sit in neither category, and existing tools leave real, everyday gaps:

- **Bank transfers are confirmed by hand.** A customer sends money via bank transfer, JazzCash, or Easypaisa, and the cashier has to manually check a banking app or wait for an SMS, cross-reference the amount, and only then mark the sale as paid — a slow, error-prone, entirely manual step that most POS systems don't touch at all.
- **Customer credit is tracked on paper.** Buy-now-pay-later ("udhaar" / "khata") is a daily reality for these shops, but it's usually a notebook or a spreadsheet with no running balance, no history, and no way to know at a glance who owes what.
- **Connectivity isn't guaranteed.** Power outages and unreliable internet are routine. A cloud-only POS simply stops working mid-sale, right when the shop needs it most.
- **A shared multi-shop database has no fair way to size or monitor itself.** A platform serving many shops on one database needs to know, in real numbers, how much space and bandwidth each shop is actually using — not guess — and needs a sane way to size a brand-new shop's quota before it has any data at all.
- **Inventory isn't just a quantity.** The same product bought from two different vendors at two different prices, with two different expiry dates, is not one number — it's two batches with two costs, and most simple POS tools flatten that into a single running count that quietly gets the profit math wrong.
- **Password recovery assumes infrastructure that doesn't exist.** A one-click "reset link to your email" flow needs a mail server and an email address on file — neither of which a small, owner-operated shop reliably has.

## What Makes This Different from a Conventional POS

| Conventional POS | This System |
|---|---|
| Manual bank-transfer confirmation | **Automated reconciliation** — a forwarded bank/SMS notification is parsed, matched to a pending payment by amount and time window, and the sale confirms itself. Multiple possible matches are flagged for a human instead of guessed. |
| Credit/customer balances as a note field or a separate spreadsheet | **A real, append-only ledger.** Every charge and every payment is its own immutable row; a customer's balance is always *derived*, never stored and manually kept in sync — so it can't silently drift from reality. |
| Stops working the moment the connection drops | **Offline-first.** Sales are queued locally (IndexedDB) the instant connectivity is lost and replayed against the server automatically, in order, the moment it's back — a receipt number is only assigned once the sale actually reaches the server. |
| One shop, one deployment | **True multi-tenancy.** One deployment, one database, many shops — each shop's data provably isolated from every other's, with a Superadmin console to create shops, assign plans, and manage storage across all of them. |
| A single fixed feature set (or a separate codebase per pricing plan) | **One codebase, three tiers** (Basic / Smart / Advanced). Every feature gate lives in a single source-of-truth registry; upgrading a shop's plan unlocks features instantly, with zero redeploys or forked builds. |
| No visibility into shared infrastructure cost | **A live, real-time Usage Monitor** (Odoo-style — actual rows/sec and bandwidth/sec, not a static snapshot) plus a **Storage Estimator** that projects a *new* shop's future footprint from this system's own measured, real per-row data sizes — never a guessed constant. |
| Flat inventory quantity | **Batch/lot-level tracking** — auto-generated, vendor-specific lot codes, per-batch buying price, and expiry awareness, so profit/loss stays accurate even when the same product was restocked at a different cost. |
| Email-link password reset | **Admin-reviewed recovery** — a locked-out user submits a request with identity details on file; a human admin verifies and approves it, appropriate for shops with no email infrastructure to safely automate around. |
| English-only | **Bilingual from day one** — every screen, in English and Urdu. |

## Core Features

### Sales & Checkout
Fast, keyboard- and barcode/lot-code-friendly checkout with cash, card, bank transfer, and store-credit tenders in the same cart. Refunds and voids are fully audited, gated to the appropriate tier, and always reconcile back through the same code path as a normal sale — never a special-cased shortcut.

### Inventory & Batch/Lot Tracking
Every restock can be tracked as its own lot: an auto-generated, human-readable code (derived from the product and vendor name), its own buying price, and its own remaining quantity — so a product bought at two different prices over time reports correct, batch-aware profit rather than one blended average. Non-batch-tracked products remain simple, single-quantity items where that's all a shop needs.

### Credit / Debit Ledger ("Udhaar")
A first-class, append-only ledger for both receivables (money owed *to* the shop) and payables (money the shop owes vendors). Balances are always computed from the transaction history via a database view — they cannot be edited directly and cannot drift out of sync with the entries that produced them. Includes a "net off" action for offsetting two parties' balances against each other directly.

### Store Credit & Vouchers
Refunds can be issued as store credit — a self-contained, redeemable voucher identified by its own code, with no separate customer-account system required.

### Bank Transfer & Digital Payments
Generates a Raast-compatible payment QR for bank transfers, and integrates with JazzCash and Easypaisa as additional channels. A pending payment ("intent") costs nothing and reserves no stock until it's actually confirmed. Confirmation can happen two ways: manually by staff, or **automatically**, via a forwarded phone notification that's parsed, matched to the correct pending payment by amount and time window, and confirmed through the exact same path a manual confirmation uses — with ambiguous matches (more than one candidate) always flagged for a human rather than guessed.

### Shift Management & Cash Reconciliation
Cashiers open a shift with a starting cash float and close it with a reconciliation against actual sales and refunds. An idle shift (an app crash, a closed tab, a forgotten close) is automatically closed after a period of inactivity so it never blocks that user from opening a new one.

### Stock Adjustments & Shrinkage Reporting
Every non-sale stock change — damaged, expired, theft, a physical count correction, or a routine restock — is recorded as an explicit, reasoned adjustment rather than a silent quantity edit, feeding a dedicated shrinkage report that breaks losses down by reason and by product.

### Reports & Analytics
Date-ranged sales reports with revenue/profit trend charts, payment-medium breakdowns, and a shrinkage cost summary — filters persist across navigation (including a browser Back from a drill-down), so a report never resets itself mid-investigation.

### Offline Mode & Sync
A service-worker-backed PWA with a local IndexedDB mirror of live data. When connectivity drops, sales queue locally and the UI keeps working; when it's restored, queued sales replay against the server in the original order and the local mirror refreshes — all automatic, no user action required.

### Multi-Tenant Platform & Superadmin Console
A dedicated Superadmin role — entirely separate from any shop, with its own login portal — can create and manage shops, assign subscription tiers, set per-shop storage quotas, and review platform-wide activity. Every shop's data is scoped and isolated at the query level, verified by an automated cross-shop isolation test suite.

### Storage Usage Monitoring & Estimator
- **Usage dashboard** — real per-shop database size, storage quota consumption, and egress (bandwidth) trends, with an optional live monitor that polls and graphs actual rows/second and bytes/second, the same way a system resource monitor would.
- **Storage Estimator** — a standalone tool for sizing a *new* shop's quota before it exists, projecting forward from real, currently-measured per-row byte sizes and inter-table ratios in this exact database, with an explicit, documented growth-safety buffer rather than a guessed number.

### Roles & Permissions
Three roles — **Superadmin** (platform-wide), **Owner** (full shop access), and **Cashier** (day-to-day operations) — with every route, feature, and action gated server-side, not just hidden in the UI.

### Security
JWT-based session auth, bcrypt-hashed passwords, an admin-reviewed password-recovery flow that explicitly excludes the platform Superadmin account from self-service reset, and a fully separate login portal for platform admins versus shop staff.

### Localization
Complete English and Urdu translations across the entire application, switchable per shop.

## Subscription Tiers

Every feature gate lives in one registry, so upgrading a shop's tier unlocks the corresponding features immediately — no redeploy, no separate build.

| Feature | Basic | Smart | Advanced |
|---|:---:|:---:|:---:|
| Core sales & checkout | ✅ | ✅ | ✅ |
| Manual quantity editing | ✅ | — | — |
| Multiple staff users | — | ✅ | ✅ |
| Void / refund sales | — | ✅ | ✅ |
| Contacts & party ledger (udhaar) | — | ✅ | ✅ |
| Store credit / vouchers | — | ✅ | ✅ |
| Bank transfer payments | — | ✅ | ✅ |
| Batch / lot tracking | — | ✅ | ✅ |
| Stock adjustments | — | ✅ | ✅ |
| Sales trend charts | — | ✅ | ✅ |
| Shift management | — | — | ✅ |
| Shrinkage report | — | — | ✅ |

## Technology Stack

**Backend** — Node.js, Express, PostgreSQL (deployed on Supabase), Redis (optional, fail-open caching layer), JWT authentication, bcrypt.

**Frontend** — React, Redux Toolkit, React Router, Tailwind CSS, Recharts, a service-worker-driven PWA with an IndexedDB offline data layer, thermal-printer receipt support.

**Integrations** — JazzCash, Easypaisa, PayFast, and Raast-compatible QR bank transfers.

## Architecture at a Glance

- **Shared-schema multi-tenancy** — every table carries a `shop_id`; every query is scoped by it, verified by an automated shop-isolation test suite rather than assumed.
- **Service-layer pattern** — HTTP concerns (Controllers) are kept separate from business logic (Services), which own their own transactions (`BEGIN`/`COMMIT`/`ROLLBACK` with row-level locking wherever two requests could race).
- **Derived, never stored, balances** — every running total (party balances, store-credit balances, stock quantities) is computed from its source transactions via SQL, so it structurally cannot drift out of sync.
- **Offline-first frontend** — a local read-mirror plus an outbox queue for writes, reconciled automatically on reconnect.

## Getting Started

### Prerequisites
- Node.js
- A PostgreSQL database (Supabase or self-hosted)
- Redis (optional — caching degrades gracefully without it)

### Backend
```bash
cd ExpressBackend
npm install
# Configure DATABASE_URL, JWT_SECRET, and (optionally) REDIS_URL, PORT, CORS_ORIGIN
npm run dev
```

### Frontend
```bash
cd clientSide/client-side
npm install
npm start
```

## Project Structure

```
POS/
├── ExpressBackend/          # Node/Express API
│   ├── Controller/          # HTTP-layer request/response handling
│   ├── Sevices/              # Business logic, transactions, and data access
│   ├── Routes/API/          # Route definitions
│   ├── migrations/          # Versioned, idempotent SQL migrations
│   └── config/features.js   # The single source of truth for tier → feature gating
└── clientSide/client-side/  # React frontend
    ├── src/pages/           # One folder per screen/feature area
    ├── src/offline/         # IndexedDB mirror, outbox, and sync manager
    ├── src/auth/            # Session/role/feature-gate context
    └── src/i18n/            # English & Urdu translations
```
