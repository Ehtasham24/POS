# Bank-Transfer QR Checkout with Gmail Auto-Confirmation

## Context

The owner wants customers to be able to pay by scanning a bank-linked QR code at checkout, and wants the POS to automatically detect that the money actually arrived — by watching the owner's Gmail inbox for the bank's payment-confirmation email — instead of a cashier having to manually check a phone and tell the system "yes, this one's paid." Today the app only supports cash and card, both settled synchronously at the register in one step.

This is a genuinely new kind of flow for this codebase: every existing payment (cash, card, store-credit voucher) is confirmed *at the moment of checkout*. A bank transfer is confirmed *some unknown time later, by an external signal*. The core design problem this plan solves is bolting a "wait for an outside event" step onto a system that has never needed one, without touching how cash/card sales already work, and without ever risking phantom stock reservations or a wrongly-confirmed sale.

**Decisions already made (with the owner) that shape this plan:**
1. **Dynamic QR** — a fresh QR per sale, amount pre-filled, not one fixed static QR.
2. **Gmail API OAuth** for email access (not IMAP app-password).
3. **Non-blocking checkout** — the cashier is free to move on immediately; the sale sits in a durable, visible "awaiting payment" state until confirmed.
4. **Never auto-cancel** — a late bank email must never cause a real payment to be wrongly voided. Unresolved intents wait indefinitely for a human or a match.
5. **Confirm/cancel is open to any logged-in staff** (not Owner-only) — same trust level as refunds today.

**Recommended shape: two phases, shipped independently.**
- **Phase A** — QR + a durable pending-payment record + manual "Mark as Paid"/"Cancel." Useful and complete on its own, zero fragility, no email integration required.
- **Phase B** — Gmail OAuth + a background poller + an email parser + auto-matching, layered on top without reworking Phase A. The manual button and the automatic matcher end up calling the *exact same* confirm function, so there's exactly one code path that ever turns a pending intent into a real sale.

This plan covers both phases in full so the whole shape is visible up front, but Phase A is a sensible place to stop and ship before starting Phase B.

## Status (as of 2026-08-19)

**Phase A is implemented and verified end-to-end** — migration `012_bank_payment_intents.sql` (+ `013_bank_payment_intent_qr_snapshot.sql`, a small follow-up that stores the generated QR image on the row instead of regenerating it on every view), `utils/bankQr.js`, `Sevices/bankPaymentService.js`, `Controller/bankPaymentController.js`, `Routes/API/bankPaymentRoutes.js`, plus the full frontend (CartPanel.jsx's Bank Transfer option, BankTransferQrModal.jsx, pages/BankPayments, PendingBankPaymentsBell, the Company page's bank-details card with a Pakistan-bank dropdown at `constants/pakistanBanks.js`).

**The QR is now a real, verified Raast Personal (P2P) payload, not a plain-text placeholder.** The original draft below (`buildQrPayload`) described a human-readable text fallback — that was superseded after reverse-engineering the actual format from two real, CRC-verified samples (a Meezan Bank dynamic "Generate QR" and a JazzCash static "My QR"), both decoding with the identical tag structure and a matching CRC-16/CCITT-FALSE checksum. Confirmed field layout: tag `00` payload format ("02"), `01` static/dynamic ("11"/"12"), `02` type flag ("00", personal/P2P), `04` beneficiary IBAN, `05` amount (dynamic only), `07` expiry DDMMYYYYHHmm (dynamic only), `10` CRC. This is genuinely scannable by bank apps' "Scan to Pay" now, confirmed working with both a regular bank (Meezan) and a wallet backed by a microfinance bank (JazzCash/Mobilink Microfinance Bank) — Raast is a true national interoperable standard, so any IBAN works regardless of issuing institution. `bank_iban` is now a required field (not "account number or IBAN") since the payload has no slot for a plain account number.

**Automatic confirmation is also implemented now — via the phone-notification-forwarder option (see the researched-alternatives section below), not Gmail.** Built and verified end-to-end (webhook auth, auto-confirm on a single match, `ambiguous` flagging on multiple matches, requeue, heartbeat staleness detection):
- `ExpressBackend/migrations/014_bank_payment_notification_matching.sql` — adds `matched_source_text`/`match_candidates` to `bank_payment_intents`.
- `ExpressBackend/Sevices/PaymentNotifications/` — `parsers/` (pluggable registry keyed by Android package name, ships with one unverified best-effort `generic.js` fallback — needs real notification-text samples to tune properly, same reverse-engineering approach already used for the QR) and `matchingService.js` (the actual matching engine, calling `bankPaymentService.js`'s `confirmIntent`/`flagAmbiguous`, newly added alongside `requeueIntent`).
- `ExpressBackend/Controller/paymentNotificationController.js` + `Routes/API/paymentNotificationRoutes.js` — `POST /api/bank-payments/webhook/notification`, `POST /api/bank-payments/webhook/heartbeat` (both gated by `Middleware/requireForwarderSecret.js`, a shared secret in `Development.env`'s `NOTIFICATION_FORWARDER_SECRET`, not session auth), `GET /api/bank-payments/webhook/status` (session-auth, staff-facing).
- `ExpressBackend/Server.js` runs a **second, separate plain-HTTP listener** (port `4001` by default, env `WEBHOOK_PORT`) carrying only the webhook routes — the phone can't be expected to trust the app's own mkcert HTTPS certificate (issued only for localhost/127.0.0.1/::1, not the LAN IP), and the webhook routes don't rely on the session cookie the HTTPS requirement was originally about.
- `ExpressBackend/Sevices/salesService.js`'s `checkoutSale` now tolerates `requestingUser` being `null` (`requestingUser?.id || null` at both `sold_by` writes) — needed since an auto-confirmed sale has no logged-in staff behind it; `sold_by` was already a nullable column.
- `PaymentNotificationForwarder/` (repo root, sibling to `ExpressBackend`/`clientSide`) — a full, hand-written Android Studio project (Kotlin, `NotificationListenerService` + `WorkManager` heartbeat + an installed-apps picker, no hardcoded package-name guesses). **Never compiled** — this session has no Android SDK/Gradle/JDK installed — see its own `README.md` for setup steps and what to expect on first Android Studio sync.
- Frontend: `pages/BankPayments/index.jsx` gained a "Keep Waiting" (requeue) action for `ambiguous` rows, a match-conflict explanation row, and a staleness banner reading the new `/webhook/status` endpoint (only shown once the forwarder has checked in at least once, so a shop not using this optional feature never sees it).

**Still needed before this is fully trustworthy in production**: real "payment received" notification-text samples (from JazzCash/whichever bank) to replace/tune the generic parser — same verification rigor as the QR reverse-engineering, not yet done for this part.

---

## Key design points (why this shape)

- **A pending "intent" is deliberately not a `sales`/`sale_transactions` row.** Stock is only ever decremented once payment is actually confirmed — never at QR-generation time. Otherwise an abandoned scan (customer walks away) would wrongly reserve/decrement stock forever. This is the single biggest structural decision in the plan.
- **Confirming an intent reuses `checkoutSale()` unchanged** (`ExpressBackend/Sevices/salesService.js:244`, signature `(items, paymentMethod, requestingUser, { voucherCode, storeCreditRedeemed })`) — the exact function cash/card sales already go through. There stays exactly one place in the whole app that ever creates a real sale. Cash/card code paths are not modified at all.
- **The Gmail refresh token cannot go through the generic `settings` table.** `GET /api/settings` (`ExpressBackend/Routes/API/settingsRoutes.js`) requires only `requireAuth` — any logged-in role, Cashier included — and returns the entire settings blob verbatim (`settingsService.js:21-29`), fetched broadly (receipt printing, Company page, Settings page). A secret stored there leaks to every cashier's browser. It needs its own table, its own owner-only endpoints, and its status endpoint must hand-build its response (`{connected, email, lastPollAt}`) rather than ever spreading the raw config row.
- **Matching never guesses.** Exactly one intent matches one email → auto-confirm. Zero matches → leave pending. More than one plausible match in either direction → flip everything involved to `ambiguous` for a human to resolve. A wrongly auto-confirmed sale (or a wrongly-left-unconfirmed real payment) is worse than asking a human to look.
- **No new library patterns invented where an existing one already fits**: reference-style display numbers follow `formatReceiptNo`/`formatRefundNo`'s existing convention (computed from the row's own `SERIAL` id at read time, never stored); row-locking for concurrent confirm/cancel follows `voidSale`/`refundSale`'s existing `FOR UPDATE` pattern; token encryption uses Node's built-in `crypto` (already used in `Sevices/ThirdParty/PayFast/generateSignatureService.js`, so not a new dependency); the background poller is a plain `setInterval` with no backoff/retry-count, matching the frontend's own `syncManager.js`/`connectivity.js` polling style — this app has no job-queue infrastructure and doesn't need one for a single-shop mailbox check every 30s.

---

## Phase A — QR + manual confirm

### Migration: `ExpressBackend/migrations/012_bank_payment_intents.sql`

```sql
CREATE TABLE IF NOT EXISTS bank_payment_intents (
  id                    SERIAL PRIMARY KEY,
  status                TEXT NOT NULL DEFAULT 'awaiting_payment',
  cart_snapshot         JSONB NOT NULL,   -- exact shape checkoutSale's `items` param expects
  amount                NUMERIC NOT NULL, -- cart total minus any store credit applied
  voucher_code          TEXT,
  store_credit_redeemed NUMERIC,
  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_by            INTEGER REFERENCES users(id),   -- NULL when auto-confirmed (Phase B)
  resolved_at            TIMESTAMP,
  resolution_note         TEXT,
  auto_confirmed         BOOLEAN NOT NULL DEFAULT false,
  transaction_id         INTEGER REFERENCES sale_transactions(id), -- set once confirmed
  last_confirm_error     TEXT,  -- e.g. a stock-conflict checkoutSale rejected on confirm attempt
  CONSTRAINT bank_payment_intents_status_check
    CHECK (status IN ('awaiting_payment', 'confirmed', 'cancelled', 'ambiguous')),
  CONSTRAINT bank_payment_intents_amount_positive CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_bank_payment_intents_status ON bank_payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_bank_payment_intents_created_at ON bank_payment_intents(created_at);
```

No `expires_at`/auto-cancel column — deliberate, per decision #4 above. No `reference_code` column — a display reference is computed as `"BTX-" + String(id).padStart(6, "0")`, mirroring `formatReceiptNo`/`formatRefundNo` (`salesService.js:210-218`), not stored.

Bank account details (`bank_name`, `bank_account_title`, `bank_account_number`, `bank_iban`) need **no migration at all** — they're plain, non-secret values, stored as ordinary new keys in the existing `settings` table via the existing `updateSetting(key, value)` (`settingsService.js:41-59`), exactly like `company_name`/`company_logo` already work.

### New backend files

| File | Responsibility |
|---|---|
| `ExpressBackend/utils/bankQr.js` | `buildQrPayload({bankName, accountTitle, accountNumber, iban}, amount, referenceCode)` and `generateQrDataUrl(payload)` (wraps the new `qrcode` npm package's `QRCode.toDataURL`). Pure, no DB — lives in `utils/` like `ApiError.js`/`cache.js`. |
| `ExpressBackend/Sevices/bankPaymentService.js` | `createIntent(cart, requestingUser, {voucherCode, storeCreditRedeemed})` — validates bank details are configured, computes amount the same way `checkoutSale` does, inserts the row, builds the QR, returns `{intentId, amount, qrDataUrl, referenceCode}`. `getIntent(id)`, `listIntents({status})`. `confirmIntent(id, {requestingUser, autoConfirmed, matchedMessageId})` — `FOR UPDATE` locks the row (same pattern as `voidSale`/`refundSale`), re-checks it's still resolvable, calls the unmodified `checkoutSale(intent.cart_snapshot, "bank_transfer", requestingUser, {voucherCode, storeCreditRedeemed})`; on success marks `confirmed` + fills `transaction_id`; on a `checkoutSale` throw (stock conflict), catches it, writes `last_confirm_error`, leaves status as-is, re-throws to the caller. `cancelIntent(id, requestingUser, reason)` — same locking, only valid from `awaiting_payment`/`ambiguous`. |
| `ExpressBackend/Controller/bankPaymentController.js` | Thin `asyncHandler`-wrapped functions, same shape as `salesController.js`. |
| `ExpressBackend/Routes/API/bankPaymentRoutes.js` | See route table below. |

**`ExpressBackend/package.json`**: add `qrcode`.

### Route table (Phase A rows)

| Method | Path | Middleware |
|---|---|---|
| POST | `/api/bank-payments/intents` | `requireAuth` |
| GET | `/api/bank-payments/intents/:id` | `requireAuth` |
| GET | `/api/bank-payments/intents` | `requireAuth` |
| PATCH | `/api/bank-payments/intents/:id/confirm` | `requireAuth` |
| PATCH | `/api/bank-payments/intents/:id/cancel` | `requireAuth` |

All any-staff — matches the owner's decision that confirm/cancel is trusted to whoever's on shift, same as `refundSale` today. `Server.js` gets one new `require`/`server.use(routesBankPayment)` pair.

### Frontend changes

- **`CartPanel.jsx`**: payment-method picker (`grid-cols-2` around line 414) becomes `grid-cols-3`, adding a `bank_transfer` option (icon `HiOutlineQrCode`, confirmed present in the installed `react-icons/hi2`). Hidden when offline — no offline-queue story for this method; a QR needs a live customer scanning it now. `canConfirm` (line 143) extended so bank transfer behaves like card (no tendered-amount check). New `handleBankTransferCheckout`, parallel to (not replacing) `handleCheckout`: builds the same cart/voucher payload already computed today, `POST /api/bank-payments/intents`, then `dispatch(clearCart())` immediately (same as cash/card), closes the payment sheet, opens a new QR modal. `handleCheckout` itself is untouched.
- **New `clientSide/client-side/src/categoriesComponents/BankTransferQrModal.jsx`**: reuses the existing `Modal` component. Shows the QR image, amount, reference code. Closing it does not cancel the intent — it lives on server-side, tracked durably elsewhere.
- **New `clientSide/client-side/src/pages/BankPayments/index.jsx`** ("Pending Bank Payments"): a new page is needed rather than folding into Sales History because Sales History is built entirely on `sales`/`sale_transactions` rows (`fetchBilledHistory`) — an `awaiting_payment` intent structurally has none of those yet. Modeled on `pages/StoreCredit/index.jsx`'s layout (table + expandable rows). Row actions: "Mark as Paid" / "Cancel." Reachable by any logged-in staff (`<ProtectedRoute>` without a `roles` restriction), matching the any-staff confirm/cancel decision — new route in `App.jsx`, new nav item.
- **New `clientSide/client-side/src/components/AppShell/PendingBankPaymentsBell.jsx`**: structurally mirrors `LowStockBell.jsx` (60s `setInterval`, badge count, dropdown), polling `GET /api/bank-payments/intents?status=awaiting_payment`. Visible to any staff, same as `LowStockBell` itself — this is what keeps status genuinely visible on an ongoing basis without a blocking modal.
- **`pages/Company/index.jsx`**: new "Bank Account (for QR payments)" card — `bank_name`/`bank_account_title`/`bank_account_number`/`bank_iban`, identical `updateSetting` pattern already used for the other company fields.
- **`i18n/translations.js`**: new keys need both `en` and `ur` entries, per the existing convention.

---

## Automatic payment confirmation — researched alternatives to Gmail (2026-08-19)

The original ask was "watch Gmail for the bank's confirmation email." Research since then found Gmail is actually the **weakest** of several real options — not every bank sends email confirmations, while SMS/push notifications are near-universal, and two of the options below are officially supported (a real webhook, not parsing) rather than reverse-engineering a signal never meant to be machine-read. Nothing here is built yet — recorded for whenever this gets picked back up. Ranked by reliability:

1. **A Raast-enabled payment gateway (PayFast, RapidGateway, etc.) — strongest option.** These sit as a registered Raast P2M merchant themselves and expose a normal REST API + signed webhook: `POST` a payment intent, redirect/show the customer a hosted checkout or QR, get a webhook the instant settlement completes. No parsing, no guessing, one integration covers every Raast bank/wallet at once (not tied to a single account). Requires signing up as a merchant with the gateway (business verification, likely a per-transaction fee). **Notable: this repo already has a partial, broken PayFast integration** (`ExpressBackend/Controller/ThirdParty/PayFast/`, `Sevices/ThirdParty/PayFast/payFastService.js`) flagged as dead code back when this plan was first written (undefined `postPayment()` call, hardcoded sandbox URLs, a second stray `pg.Pool` with different env vars than `Db.js`) — PayFast's own site advertises being "the first payment gateway to enable Raast P2M payments in Pakistan," so completing/fixing this existing scaffolding is likely the shortest path to this option, not a from-scratch build.
2. **JazzCash's own Merchant/Business API.** Real-time IPN (Instant Payment Notification) webhook, official, same "no parsing" reliability as #1 — confirmed via JazzCash's own sandbox docs (real-time delivery with automatic retries on failure). Narrower than #1: only covers JazzCash, not other banks/wallets a customer might pay from. Needs JazzCash Business/merchant registration (self-service app onboarding exists per JazzCash's own materials, exact document requirements for a small/sole-proprietor shop not fully confirmed).
3. **DIY: forward SMS or bank-app push notifications from a dedicated phone.** No merchant registration at all — keeps using the owner's existing personal JazzCash/bank account exactly as today. A spare Android phone with the bank/wallet app logged in, running an SMS-forwarder or notification-listener app (real examples exist, e.g. PayHook and general-purpose SMS-to-webhook forwarders), POSTs matching messages to a new backend endpoint the moment a "payment received" text/notification lands — often *faster* than email, since banks push SMS/notifications more universally and more instantly than they send email. Trade-off: it's exactly as fragile as it sounds — the phone must stay powered, connected, and unkilled by Android's background battery optimization, and building this means writing (or adopting) both a phone-side forwarder and a backend receiver + parser, similar shape/effort to the Gmail poller below.
4. **Gmail inbox watching (original plan, kept below as written).** Weakest of the four: depends entirely on whether the owner's specific bank sends email at all — several don't, or only for some transaction types — where SMS/push confirmation is close to universal. Kept in this document for completeness/history, not as the current recommendation.

---

## Phase B — Gmail auto-confirmation (superseded by the section above — kept for reference)

### Migrations

`ExpressBackend/migrations/013_bank_email_watch_config.sql`:
```sql
CREATE TABLE IF NOT EXISTS bank_email_watch_config (
  id                       SMALLINT PRIMARY KEY DEFAULT 1,
  gmail_email_address      TEXT,
  refresh_token_encrypted  TEXT,   -- AES-256-GCM, base64; never included in any API response
  is_enabled               BOOLEAN NOT NULL DEFAULT true,
  active_parser_key        TEXT,   -- which registered parser to match against; NULL = safe no-op
  connected_by             INTEGER REFERENCES users(id),
  connected_at             TIMESTAMP,
  last_poll_at             TIMESTAMP,
  last_poll_status         TEXT,
  last_poll_error          TEXT,
  CONSTRAINT bank_email_watch_config_singleton CHECK (id = 1)
);
```
Single-row table (one shop, one mailbox — `users` has no email column and doesn't need one here). Created lazily on first `/connect`, via `INSERT ... ON CONFLICT (id) DO UPDATE`.

`ExpressBackend/migrations/014_bank_payment_intent_matching_columns.sql`:
```sql
ALTER TABLE bank_payment_intents ADD COLUMN IF NOT EXISTS matched_message_id TEXT;
ALTER TABLE bank_payment_intents ADD COLUMN IF NOT EXISTS match_candidates JSONB;
CREATE INDEX IF NOT EXISTS idx_bank_payment_intents_matched_message_id
  ON bank_payment_intents(matched_message_id);
```
An `ALTER` on top of Phase A's table, not a rework — mirrors how `refunds` (migration 009) got `contact_id` added two migrations later (migration 011) rather than redesigned in place.

### New backend files

| File | Responsibility |
|---|---|
| `Sevices/BankTransfer/gmailAuthService.js` | Builds the OAuth2 client (new `googleapis` dependency), consent URL with a random CSRF `state`, code-for-token exchange, AES-256-GCM encrypt/decrypt of the refresh token via Node's built-in `crypto`, reads/writes `bank_email_watch_config`, `getStatus()` (returns only the safe `{connected, email, lastPollAt, lastPollStatus}` shape — **never** spreads the raw row), `disconnect()`. |
| `Sevices/BankTransfer/parsers/index.js` | Registry: `registerParser(key, parser)`, `getParser(key)`, `listParsers()`, `allGmailQueryFragments()`. **Ships with zero parsers registered** — see "Needs real input" below. Interface: `{key, label, gmailQueryFragment, canParse(message), parse(message) => {amount, timestamp, reference, raw} | null}`. |
| `Sevices/BankTransfer/matchingService.js` | Pure matching logic, kept separate from Gmail-fetching mechanics — implements the algorithm below. |
| `Sevices/BankTransfer/emailPoller.js` | `startEmailPoller()`, explicitly called once from `Server.js` (not self-starting on `require`). `setInterval(pollOnce, POLL_INTERVAL_MS)` (`process.env.BANK_EMAIL_POLL_INTERVAL_MS`, default 30000). Re-reads `bank_email_watch_config` every cycle (not cached at boot) so toggling Connect/Disable in Settings takes effect within one interval. Whole cycle wrapped in try/catch; a failure is logged + written to `last_poll_error`, next tick just retries — no exponential backoff/dead-letter, matching `syncManager.js`'s existing style. |
| `Controller/bankGmailController.js` | `GetGmailStatus`, `ConnectGmail`, `OAuthCallback`, `DisconnectGmail`, `ListParsers`. |
| `Routes/API/bankGmailRoutes.js` | All routes `requireAuth + requireOwner` — connecting/disconnecting the mailbox integration stays an owner-level decision even though day-to-day confirm/cancel doesn't. |

**`package.json`**: add `googleapis`.

### Route table (Phase B additions)

| Method | Path | Middleware |
|---|---|---|
| PATCH | `/api/bank-payments/intents/:id/requeue` | `requireAuth` (ambiguous → awaiting_payment, same trust level as confirm/cancel) |
| GET | `/api/bank-payments/gmail/status` | `requireAuth, requireOwner` |
| GET | `/api/bank-payments/gmail/connect` | `requireAuth, requireOwner` |
| GET | `/api/bank-payments/gmail/oauth-callback` | `requireAuth, requireOwner` |
| POST | `/api/bank-payments/gmail/disconnect` | `requireAuth, requireOwner` |
| GET | `/api/bank-payments/gmail/parsers` | `requireAuth, requireOwner` |

### Matching algorithm (`matchingService.js`, run every poll cycle)

1. Load `bank_email_watch_config`. No row / `is_enabled=false` / no token → no-op.
2. `SELECT * FROM bank_payment_intents WHERE status = 'awaiting_payment'`. Empty → no-op (cheap DB check gates every expensive Gmail call).
3. No `active_parser_key` registered → no-op (log once).
4. Refresh the Gmail access token. Search `after:<last_poll_at minus ~10min safety buffer>` combined with the active parser's `gmailQueryFragment`.
5. For each new message not already `matched_message_id` on some intent → fetch → run the parser's `canParse`/`parse`. Unparseable → skip + log, never throw (fail-open, same philosophy as `utils/cache.js`).
6. For each parsed `{amount, timestamp}`, candidate intents = `awaiting_payment` where `amount` matches exactly (this app already deals in whole-currency-unit amounts everywhere — `.toFixed(0)` throughout `CartPanel.jsx`) **and** `created_at <= timestamp <= created_at + 72h` (hardcoded constant, a generous "don't match a stale old email" heuristic, not a cancellation mechanism).
7. Outcome, checked in both directions (one email vs many intents, and one intent vs many emails):
   - **Zero candidates** → nothing written.
   - **Exactly one clean match both ways** → call `confirmIntent(id, {requestingUser: null, autoConfirmed: true, matchedMessageId})` — the *same* function the manual button calls. A `checkoutSale` failure here (stock conflict) is caught, written to `last_confirm_error`, loop continues.
   - **More than one candidate in either direction** (including a genuine duplicate transfer) → flip every intent involved to `ambiguous`, write `match_candidates` with the conflicting email(s)/intent id(s), **never auto-confirm any of them**.
8. Always update `last_poll_at`/`last_poll_status`/`last_poll_error`, success or failure.

### Frontend additions

- **`pages/Settings/index.jsx`**: new `GmailConnectCard` component (own file, mirroring how `PrinterCard`/`UsersCard` are already separate components composed into this page) — connected email + last-poll status via `GET /api/bank-payments/gmail/status`, "Connect Gmail" as a real `window.location.href` redirect (not `fetch`), "Disconnect," and a parser-selection dropdown from `GET /api/bank-payments/gmail/parsers`. Owner-only, matching the route gating.
- **Pending Bank Payments page**: gains an "Ambiguous" section rendering `match_candidates` with "Mark as Paid" / "Cancel" / "Keep Waiting" (requeue) actions.

---

## Concurrency & security

- **Concurrent confirm/cancel on the same intent** (double-click, or the poller and a human at the same instant): `FOR UPDATE` row lock + re-check status, identical to `voidSale` (`salesService.js:562`) / `refundSale` (`:673`) — makes two simultaneous attempts serialize correctly under Postgres read-committed.
- **Cross-intent stock collision is an accepted trade-off, not a bug**: because stock is deliberately never reserved at QR-generation time, two customers' intents can both target the last unit of a product. Whichever confirms first wins; the second's `checkoutSale` throws `409 Insufficient inventory`, which is caught, written to `last_confirm_error`, and stays visible in Pending Bank Payments for manual resolution (refund the loser, or restock). This must surface clearly, not vanish silently.
- **Token encryption**: AES-256-GCM via Node's built-in `crypto` (already used in this codebase for PayFast's signature — not a new dependency), keyed by a new `TOKEN_ENCRYPTION_KEY` in `Development.env`. Rotating/losing that key means reconnecting Gmail from scratch — worth a one-line warning, not a blocker (same as `JWT_SECRET` rotation already invalidating sessions today).
- **The landmine to watch for during implementation**: `settingsController.js`'s `GetSettings` does `res.send({...settings})` — a full spread. `bankGmailController.js`'s status handler must hand-build `{connected, email, lastPollAt, lastPollStatus}` and must never spread the raw `bank_email_watch_config` row, or the encrypted token leaks into a network response regardless of how well it's encrypted at rest.
- **CSRF on the OAuth callback**: random `state` on `/connect`, stored in a short-lived `httpOnly` cookie, verified on `/oauth-callback` before exchanging the code — standard OAuth defense on top of the existing session cookie.
- **QR content itself is not sensitive** — an account number/IBAN is meant to be shared to receive a transfer. Only the Gmail refresh token needs protecting.

---

## Verification plan

No automated test suite exists in this repo — verification here is manual, matching how recent features in this codebase were verified (per commit messages). All of the below is meant to be *run*, not just read, before considering a phase done.

**Phase A**: apply migration 012, confirm re-running it is a no-op → fill in bank details on the Company page, confirm a Cashier session's `GET /api/settings` legitimately includes them (expected, not a leak) → generate a QR from the register, confirm a `bank_payment_intents` row exists with no matching `sales`/`sale_transactions` rows and unchanged `products.quantity` → confirm the Pending Bank Payments page lists it, any logged-in role can reach it → "Mark as Paid," confirm a real sale now exists, stock decremented once, `payment_method='bank_transfer'` → "Cancel" on a second intent, confirm nothing touched → two tabs confirming the same intent simultaneously, confirm only one sale results → two intents exceeding one product's stock, confirm the second surfaces `last_confirm_error` instead of silently vanishing → confirm the Bank Transfer option is hidden while offline and cash/card are unaffected.

**Phase B**: apply 013/014 → Connect Gmail as Owner, confirm the real Google consent screen, confirm `bank_email_watch_config` has exactly one encrypted-token row, confirm the token is genuinely opaque (decrypts correctly with the right `TOKEN_ENCRYPTION_KEY`, fails with a wrong one) → inspect `GET /api/bank-payments/gmail/status` in the browser Network tab, confirm no token field ever appears → confirm `last_poll_at` advances roughly every `POLL_INTERVAL_MS` → once a real parser exists (see below), create a matching intent, confirm it auto-confirms within one poll cycle with `auto_confirmed=true` and a real sale → create two same-amount intents in-window, let one matching email arrive, confirm **both** flip to `ambiguous`, never a guess → send an unrelated/wrong-amount email, confirm nothing changes and nothing crashes → revoke the app's Google access from the Google Account's own settings, confirm the next poll fails gracefully (`last_poll_status='error'`) rather than crashing the server → Disconnect, confirm the stored token is cleared and the poller safely no-ops.

---

## Cannot be fully planned yet — needed before/during implementation

1. **A real sample bank confirmation email** (2-3, redact account numbers) — the hard blocker on writing any concrete parser. Until then, Phase B ships with the registry wired but zero parsers registered — a safe, inert no-op.
2. **Whether the bank's email even contains the amount as parseable text** (vs. only inside an image/PDF) — check this on the first real sample before writing a parser; if it doesn't, text-parsing doesn't work for that bank and needs rethinking.
3. **Google Cloud OAuth app setup** — a real project + consent screen. Flag: if the consent screen stays in "Testing" mode, Google expires refresh tokens after 7 days, which looks like the automation randomly breaking weekly — reliable always-on use likely needs basic app verification.
4. **The exact OAuth redirect URI to register** — needs a stable URL this app is actually reached at day-to-day (this session's own work shows the app currently runs across a few different local origins).
5. **Final QR payload format.** A plain-text/structured payload (bank name, account title, IBAN, amount, reference) always scans and needs no rail research, but only gets the customer to *read and manually re-type* the amount into their banking app — true one-tap autofill needs a real interbank standard (Pakistan's Raast QR is almost certainly the right target, given PKR throughout this app). Recommend hand-building one sample Raast-format QR string and testing it against a couple of real banking apps before investing in a full TLV encoder — its payoff depends entirely on what the shop's actual customers' apps support today.
6. **Real-world Gmail query precision** — how noisy the owner's actual inbox is only becomes observable once actually polling it; the parser's `gmailQueryFragment` may need tightening after seeing real traffic.

---

## Critical files for implementation

- `ExpressBackend/Sevices/salesService.js` — `checkoutSale` (line 244) is called unmodified by `confirmIntent`; `voidSale`/`refundSale` (557-754) are the locking/`ApiError` patterns to mirror.
- `ExpressBackend/migrations/009_refunds.sql` / `011_store_credit_vouchers.sql` — precedent for the ALTER-later-for-new-columns migration split this plan follows for Phase B.
- `ExpressBackend/Routes/API/storeCreditRoutes.js` — confirmed real precedent for splitting a router's routes across trust levels.
- `clientSide/client-side/src/categoriesComponents/CartPanel.jsx` — where the third payment method, `handleBankTransferCheckout`, and the QR modal trigger get added; `handleCheckout` itself stays untouched.
- `clientSide/client-side/src/App.jsx` — confirmed `ProtectedRoute`/`OWNER_ONLY` pattern for wiring the new page and Gmail-only bits.
- `clientSide/client-side/src/pages/Settings/index.jsx` and `pages/Company/index.jsx` — where the new Gmail card and bank-details card respectively get added, following `PrinterCard`'s and the logo-upload's existing patterns.
