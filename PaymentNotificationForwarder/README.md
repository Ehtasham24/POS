# Payment Notification Forwarder

A small Android app for a **dedicated, spare phone** at the shop. It reads incoming
"payment received" notifications from apps you pick (JazzCash, Easypaisa, your bank app,
etc.) and forwards the raw text to the POS backend, which matches it against pending
bank-transfer sales and confirms them automatically — see `plan.md` at the repo root for
the full design and how this fits into the POS system's Bank Payments feature.

This app was written without any Android SDK/Gradle/Java installed on the machine that
generated it, so it has **never been compiled**. The code follows standard, well-known
Android APIs throughout (`NotificationListenerService`, `WorkManager`, plain
`HttpURLConnection`) and should build cleanly in a current Android Studio, but budget a
little time for Android Studio's first-open sync to surface anything that needs a small
fix.

## Setup — one time

1. **Open this folder in Android Studio.** `File → Open`, pick `PaymentNotificationForwarder/`.
   - The Gradle wrapper JAR/scripts aren't included (they're binary files this session
     couldn't generate) — Android Studio detects this automatically and either offers to
     regenerate them or just syncs using its own bundled Gradle. If it prompts to upgrade
     the Android Gradle Plugin/Gradle version shown in `build.gradle` /
     `gradle/wrapper/gradle-wrapper.properties`, accepting the suggested upgrade is fine.
2. **Connect the spare phone** via USB (enable Developer Options → USB Debugging on it
   first — search "[phone model] enable USB debugging" if unfamiliar) and hit Run ▶ in
   Android Studio, or build an APK (`Build → Build Bundle(s) / APK(s) → Build APK(s)`) and
   install it by copying the `.apk` to the phone and opening it.
3. **In the app**, fill in:
   - **POS Server**: `http://<your-PC's-LAN-IP>:4001` — e.g. `http://10.0.9.72:4001` (this
     machine's current LAN IP; find it again anytime with `ipconfig` on the PC running the
     POS backend — look for the "Wi-Fi" adapter's IPv4 address). Port **4001**, not 4000 —
     see `ExpressBackend/Server.js`'s comment on why the phone talks to a separate plain-HTTP
     port instead of the app's own HTTPS port.
   - **Secret**: copy `NOTIFICATION_FORWARDER_SECRET` exactly from `ExpressBackend/Development.env`.
   - Tap **Save Settings**.
4. Tap **Grant Notification Access** → find "Payment Notification Forwarder" in the list
   Android opens → turn it on. Come back to the app; the status line should flip to
   "granted ✓".
5. Tap **Disable Battery Optimization** → allow it. Without this, Android may kill the
   listener in the background after a while, especially on Xiaomi/Oppo/Vivo/Realme phones,
   which also have their own extra "auto-start"/"battery saver" settings beyond stock
   Android — if notifications stop forwarding after some hours of idle, check that phone
   brand's own battery/auto-start settings for this app too, not just this dialog.
6. Tap **Test Connection** — should show "✓ Connected". If not, double-check the phone and
   the PC are on the **same WiFi network**, the POS backend is running, and the secret
   matches exactly.
7. In the **Apps to Monitor** list, tick JazzCash / Easypaisa / your bank app(s) — whichever
   ones are installed and logged into the same account(s) configured on the POS's Company
   page.

From here it runs unattended: keep the phone charged and on WiFi, and it forwards matching
notifications automatically.

## Tuning the parser for a specific bank/app

`ExpressBackend/Sevices/PaymentNotifications/parsers/generic.js` is a best-effort fallback
(matches "Rs./PKR <number>" in the notification text) — it has **not** been verified against
a real notification, unlike `ExpressBackend/utils/bankQr.js`'s QR encoding (which was
reverse-engineered and CRC-checked against real Meezan/JazzCash samples). If the generic
parser misses real "payment received" notifications, or a bank's phrasing has multiple
numbers in the text (so it grabs the wrong one), share 2-3 real notification texts (redact
the sender's name/number if you want) the same way the QR was worked out, and a tuned
parser can be added to that folder, registered by package name in
`Sevices/PaymentNotifications/parsers/index.js`.

## What's NOT included yet

- App icon is a placeholder system icon (`@android:drawable/sym_def_app_icon`), not a
  custom one — purely cosmetic, doesn't affect function.
- No automated tests (this whole app is small enough that manual testing via **Test
  Connection** + watching `ExpressBackend`'s console log when a real notification arrives
  is the practical way to verify it, same as everything else in this repo — see the main
  `plan.md`'s own "no automated test suite" note).
