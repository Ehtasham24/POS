# Offline Registers: Local Backend on Windows and Android, Synced Through the Cloud

Status: plan, not started (2026-09-30). iPhone is out of scope for now.

## Goal

A shop keeps selling when the internet or the electricity goes. The shop PC is the main
register; any cashier's Android phone can take over as a backup register during load-shedding.
When a device reconnects, its sales reach the cloud and every other device (and the owner's
phone at home) sees them. The owner can always tell, per shop and per device, how long ago
each device last synced and how much it still has waiting to send.

## Architecture

```
DEVICE (Windows PC or Android phone)                         CLOUD (Oracle, Mumbai)
┌──────────────────────────────────────────────┐            ┌─────────────────────────────┐
│ Wrapper: Windows → Electron                  │            │ Cloud backend (today's code)│
│          Android → Capacitor + nodejs-mobile │            │  + /api/devices/*           │
│                                              │            │  + /api/sync/push, /pull    │
│ React app ── http://localhost ──▶ Local      │   HTTPS    │  admin, webhooks, billing:  │
│                                   backend    │ ◀────────▶ │  cloud only                 │
│                                   (same      │  device    │            │                │
│                                   Express    │  token     │ Supabase Postgres           │
│                                   code)      │            │  devices, sync_changes,     │
│                                     │        │            │  sync_rejections, ...       │
│ Local DB (PGlite): this shop only,  ▼        │            └─────────────────────────────┘
│ plus sync_outbox, sync_state                 │
│ Sync worker: push after each write, pull on  │
│ open / every 20s / on reconnect              │
└──────────────────────────────────────────────┘
```

- The device holds only its own shop's data and a revocable **device token**.
  `DATABASE_URL` and `JWT_SECRET` never leave the cloud.
- The local backend is the existing Express code running against a local database. `Db.js`
  gains a second adapter (PGlite) and runs with `DB_TENANT_RLS=off` on the device, since one
  local database only ever contains one shop.
- The browser version keeps working exactly as today, talking to the cloud directly. Its
  writes reach devices through the same change feed as everything else.
- Device modes, chosen at registration and changeable later:
  - **Register** (local + sync): sells offline. The shop PC, and any phone that is a backup
    register.
  - **Viewer** (online): reads the cloud directly, stores nothing. An owner's phone used only
    for reports.

## Cloud schema

### Device sync state (the per-shop "last synced" view)

```sql
CREATE TABLE devices (
  id               UUID PRIMARY KEY,               -- generated on the device at install
  shop_id          INTEGER NOT NULL REFERENCES shops(id),
  name             TEXT NOT NULL,                  -- "Counter PC", "Ali's phone"
  platform         TEXT NOT NULL CHECK (platform IN ('windows', 'android')),
  mode             TEXT NOT NULL CHECK (mode IN ('register', 'viewer')),
  receipt_prefix   TEXT NOT NULL,                  -- "P1", "M2" (unique per shop)
  token_hash       TEXT NOT NULL,
  registered_by    INTEGER NOT NULL REFERENCES users(id),
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  app_version      TEXT,
  protocol_version INTEGER,
  last_seen_at     TIMESTAMPTZ,                    -- any request from the device
  last_push_at     TIMESTAMPTZ,                    -- last successful push
  last_pull_at     TIMESTAMPTZ,                    -- last successful pull
  last_applied_seq BIGINT NOT NULL DEFAULT 0,      -- highest outbox seq applied, in order
  pending_count    INTEGER NOT NULL DEFAULT 0,     -- device-reported unsent outbox entries
  oldest_pending_at TIMESTAMPTZ,                   -- device-reported age of oldest unsent entry
  clock_skew_ms    INTEGER,                        -- device clock minus server clock, last sync
  last_error       TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'retired', 'blocked')),
  UNIQUE (shop_id, receipt_prefix)
);
CREATE INDEX idx_devices_shop ON devices(shop_id);
```

`pending_count` / `oldest_pending_at` are the one exception to "derive, never store": the
outbox lives on the device, so the cloud can only know what the device last reported. They
are labeled as such everywhere they're shown ("as of last contact 3h ago").

The per-shop view is a query, not a table: every device of a shop, with its last push and pull,
pending entries, and a status derived from them:

| Status | Rule |
|---|---|
| In sync | last push within 5 min and pending = 0 |
| Behind | pending > 0, or no contact for over 1 hour during shop hours |
| Offline long | no contact for over 24 hours with pending > 0 |
| Retired / blocked | set by the owner or admin |

It's shown in three places: a **Devices** page for the owner, a Devices tab in the admin
console's shop detail, and a warning chip on the admin Health page for shops with a device
offline too long.

`sync_log` keeps one row per sync (device, direction, rows, duration, result) for 30 days, so
"why didn't this sale arrive" can be answered from the admin console.

### Stable identities across devices

Today every table is keyed by a `SERIAL` id, and receipt, refund and voucher numbers are
formatted from those ids. Two offline devices would hand out the same numbers.

- Every synced table gets `uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid()`, backfilled
  for existing rows. Integer ids stay as the cloud's primary keys, and nothing existing changes
  shape. The sync protocol refers to rows **only by uuid**; each side maps uuid → its own local
  id.
- **Receipt numbers** become a stored `receipt_no` on `sale_transactions`, `refunds` (and so on
  voucher codes): `{devicePrefix}-{per-device counter}`, e.g. `P1-000123`, `M2-000045`. Each
  device counts on its own, so two devices can never collide. Sales made in the browser use the
  prefix `W`. Existing rows keep their `RCPT-000123` / `REF-000123` numbers, written into the
  new column by the migration. Voucher lookup switches from "parse the id out of the code" to
  "look up by code".
- **Lot codes** get the device prefix too (`lot_sequences` becomes per device), because a lot
  received offline on two devices would otherwise get the same code.

### Change feed (how pull knows what changed)

`updated_at` is not safe to page on: two transactions can commit out of order, and deletes
leave no row behind. Instead:

- A trigger on every synced table appends to `sync_changes (id BIGSERIAL, shop_id, table_name,
  row_uuid, op, xid xid8 DEFAULT pg_current_xact_id(), changed_at)`.
- A pull returns changes after the device's cursor, but only up to the oldest transaction still
  running (`pg_snapshot_xmin(pg_current_snapshot())`), so a change that commits late is never
  skipped. Applying a change is an idempotent upsert by uuid, so the rare repeat is harmless.
- Deletes become soft deletes (`deleted_at`) on synced tables. The change feed carries them
  like any other change.
- The feed is pruned after 90 days. A device whose cursor is older than that re-downloads a
  full snapshot.

## The sync protocol

### Registration and first run
1. Install, open, log in. This needs internet once.
2. The cloud checks the user, the shop's status and the shop's device limit, then creates the
   `devices` row, assigns a receipt prefix, and returns a device token. The token is stored in
   Electron `safeStorage` on Windows and the Android Keystore on Android.
3. Snapshot download: master data (products, lots, categories, contacts, users, settings, open
   shifts) plus the last 90 days of sales and ledgers. It's paged and resumable. The device
   can't sell until the snapshot completes, and the progress is shown.

### Push (device → cloud)
- Every local write inserts an outbox event in the **same local transaction** as the write:
  `{event_uuid, seq, type, payload_version, payload, created_at_device}`. The event describes
  intent (for example "sale: these items, these quantities, this price"), not raw row images.
- Events are sent in `seq` order, in batches of up to 200, within ~2s of the write while
  online. The cloud applies each event in its own transaction and records `last_applied_seq`.
  - An event already applied (same `event_uuid`) is acknowledged, not re-applied.
  - A gap in `seq` is refused until the missing event arrives.
- The cloud **re-validates everything**:
  - shop comes from the device token, never the payload;
  - `shopOwnership.js` checks on every referenced uuid;
  - feature tier;
  - the user is active in that shop.
- An event that can never apply (validation failure) goes to `sync_rejections` with its payload
  and reason, and is acknowledged so the queue keeps moving. The owner sees it on the Devices
  page. Nothing is ever silently dropped.
- The device reports `pending_count`, `oldest_pending_at` and its clock on every push.

### Pull (cloud → device)
- On app open, every 20s while the app is open, on reconnect, and right after a push.
- A cheap "anything new since cursor X?" check first, so idle polling costs one indexed query.
- **Rebase:** a pulled row that the device also has unsent changes for is overwritten by the
  cloud version, then the device's pending events are re-applied on top. For stock this means
  `local quantity = cloud quantity + pending local deltas`. Without this, a pull either resets
  stock or double-counts it.

## Edge cases and the rule for each

### Money and stock
| Case | Rule |
|---|---|
| Two devices sell the last unit offline | Both sales are accepted. Stock is applied as deltas and may go negative. The product lands in a **Stock review** list for the owner. The goods physically left the shop, so refusing the sale would be wrong. |
| Pull arrives while a sale is unsent | Rebase (above). |
| Sale price edited in the cloud while a device sells offline | The sale keeps the price the cashier charged. The price change reaches the device on the next pull. |
| Refund or void of a sale made on another device that hasn't synced yet | Not possible: that device can't see the sale. The refund waits until the sale syncs. |
| Same sale voided on two devices | The second void is a no-op, not an error. |
| Refund over the remaining refundable amount (two devices refund the same sale offline) | The cloud caps it at what's left, and the excess goes to `sync_rejections` for the owner. |
| Store-credit voucher redeemed on two devices offline | **Redemption needs internet** (recommended). The balance is shared money and can't be split safely offline. The register shows "needs internet" for vouchers only. |
| Customer credit (udhaar) over the credit limit offline | Allowed, and flagged in review. The ledger is append-only and its balance is derived, so it always converges. |
| Bank / QR payment offline | Not available offline, because confirmation comes from a cloud webhook. Cash and card work offline. |

### Shifts (one cash drawer, several devices)
| Case | Rule |
|---|---|
| Shift opened on the PC, power cut, cashier continues on the phone | The phone already pulled the open shift, so its sales attach to **the same shift**. |
| The phone never received the shift (the PC opened it offline, then died) | The phone opens its own shift. When both reach the cloud, the user has two open shifts on two devices. Closing a shift closes **all** of that user's open shifts with **one** cash count against their combined expected cash. The unique index becomes one open shift per user **per device**. |
| Shift closed on the PC while the phone still sells into it | The cloud attaches late sales to that shift and marks it "needs re-count". |

### Identity and access
| Case | Rule |
|---|---|
| User deactivated or password changed in the cloud; device offline | Offline login works only for users who logged in online on that device in the last 7 days. The next pull applies the change and ends their local session. |
| Device lost or stolen | Owner or admin sets it to **blocked**: the token is rejected and its pushes are refused (its unsent data is untrusted). |
| Device replaced normally | **Retired**: it may push what it has, then it's wiped. A device must never be wiped with unsent entries without an explicit confirmation showing the count. |
| Shop suspended, or tier downgraded, while a device is offline | The device picks it up on its next pull. Offline, it keeps working for a grace period (below). |
| Device offline for a long time | Warn after 3 days. After 14 days, sales are blocked until it syncs (this caps drift and billing abuse). Both numbers are configurable per platform. |

### Clock and ordering
| Case | Rule |
|---|---|
| Device clock wrong (common on phones) | The device records its own time. The cloud records skew on every sync and stores `received_at` too. Skew over 5 minutes shows a banner on the device ("fix your phone's time"), and the sale is flagged on the Devices page. Reports use the device time, as the cashier saw it. |
| Events from two devices interleave | Order only matters within one device (its `seq`). Across devices every rule above is order-independent: deltas, append-only records, or last-write-wins by server arrival. |
| Product edited on two devices offline | The last to reach the cloud wins, per field. The overwritten value is kept in the audit log. |
| Two devices create a product or category with the same name offline | The unique `(shop_id, productname)` would reject the second. The cloud instead keeps it, renames it "name (P2)", and lists it in review so the owner can merge. |

### Failure and durability
| Case | Rule |
|---|---|
| Power cut in the middle of a write (the core scenario) | The local write and its outbox event share one transaction, so both exist or neither does. **PGlite must pass a hard power-off test in phase 0.** If it doesn't, the device database becomes SQLite (proven here). |
| Network drops mid-push | The cloud applied some events. The device re-sends from its last acknowledged seq, and repeats are ignored by `event_uuid`. |
| Cloud applied an event but the acknowledgement was lost | Same as above: the resend is ignored. |
| App updated to a new schema while events are unsent | Events carry `payload_version`, and the cloud keeps upgraders for older versions for at least 6 months. The cloud never refuses data for being old. Local migrations run on start, before the sync worker. |
| Very old app version | Pull and new features are refused with "update required". **Push is still accepted.** |
| Phone storage fills up / local DB grows | Keep 90 days of sales locally, with older history read from the cloud when online. The app shows free space and warns at 90%. |
| App uninstalled or data cleared with unsent entries | Unrecoverable on Android. Mitigations: push within seconds when online, show the pending count prominently, and have the Devices page show "oldest unsent" so a stuck device is noticed quickly. |
| Windows DB corruption | A daily local backup copy (last 7 kept). Recovery: re-download the snapshot, then replay what survives. |
| Android kills the app in the background | Sync runs while the app is open. A "backup register" phone refreshes when opened (a pull is 1–3s). Periodic background refresh (Android's 15-minute minimum, WorkManager) is a later add-on, not a dependency. |

### Scale
| Case | Rule |
|---|---|
| Many devices polling | The "anything new?" check is one indexed query. At 100 shops × 3 devices every 20s that's ~15 req/s, well inside one Oracle instance. `scripts/load-test.js` gets a sync scenario to prove it. |
| Large shop's first snapshot | Paged and resumable. Measured in phase 0 with a seeded 50k-sale test shop. |

## Phases

| Phase | Work | Done when |
|---|---|---|
| **0. Prototype** (1–2 wk) | Express + PGlite inside Electron and inside Capacitor + nodejs-mobile on Android. | Checkout works on both. The hard power-off test passes 100/100. Speed is measured. **Go/no-go on PGlite vs SQLite.** |
| **1. Cloud groundwork** (2 wk) | Migration: `devices`, `sync_log`, `sync_rejections`, uuid columns and backfill, `receipt_no`, device-scoped lot codes, soft deletes, `sync_changes` triggers. Device registration API. | Isolation suite passes with the new tables. Receipts show the stored numbers. The web app is unchanged for users. |
| **2. Local mode** (2–3 wk) | Local backend packaging, snapshot download, local login, outbox writes in every write service. | A device sells for a day with the network cable pulled. |
| **3. Sync engine** (3–4 wk) | Push, pull, rebase, the rules above, rejections. | The sync simulator (below) converges with zero invariant violations. |
| **4. Visibility** (1–2 wk) | Owner Devices page, admin Devices tab, Health warning, review lists (stock, rejections, duplicates). | The owner can answer "is everything in?" from their phone. |
| **5. Pilot** (2 wk) | One real shop (PC + one backup phone), with load-shedding days included. | Two weeks with no lost or duplicated sale. |

## Test plan: the sync simulator

A script in the style of `scripts/load-test.js`: a temporary shop, removed at the end, and N
simulated devices each running a local backend. It runs randomized rounds of:
- offline selling, refunds, voids, stock adjustments and edits;
- network drops mid-push, lost acknowledgements, duplicated deliveries;
- clock skew, app restarts mid-write, an old-protocol device.

After each round it syncs everything and checks the invariants:
- every outbox event applied exactly once;
- cloud stock = opening + received − sold + refunded ± adjustments, per product and lot;
- receipt numbers unique per shop;
- every device's local data equals the cloud's after a full pull;
- shift expected cash = the sum of its sales and cash movements, across devices;
- nothing lost: every rejected event is present in `sync_rejections`.

## Decisions needed from the owner (recommended defaults in bold)

1. Voucher redemption offline: **needs internet**, or allow it and flag overspends.
2. Offline limits: **warn at 3 days, block sales at 14 days**.
3. Local history kept on a device: **90 days**.
4. Devices per shop by tier: **Basic 1, Smart 2, Advanced 5**.
5. Who can register a device: **owner only**, or any cashier with owner approval.
