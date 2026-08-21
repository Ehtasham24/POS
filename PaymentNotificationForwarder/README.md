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
   page. **This is also the email channel** — if the bank confirms by email, tick your
   email app (e.g. Gmail) here too. Nothing else to set up for email specifically: it's
   forwarded and parsed exactly the same way as any other app's notification.
8. If the bank/wallet also confirms by **SMS**, scroll to **SMS to Monitor**: tap **Grant
   SMS Permission** (a normal Android permission dialog — allow it), then type the sender
   ID(s) that text you when a payment lands (e.g. `JazzCash` or a shortcode like `8080`,
   comma-separated for more than one) into the box and tap **Save Senders**. Only SMS from
   senders listed here are ever read or forwarded — everything else on the phone (personal
   texts, OTPs, etc.) is left alone. Unlike the notification-based channels above, SMS is
   read directly (the full, un-truncated message), not through a notification banner.

From here it runs unattended: keep the phone charged and on WiFi, and it forwards matching
notifications/texts automatically. SMS and app-notification (including email) channels
both feed the exact same backend matching engine — whichever one reports the payment
first is the one that confirms the sale.

## Tuning the parser for a specific bank/app/SMS sender

`ExpressBackend/Sevices/PaymentNotifications/parsers/generic.js` is a best-effort fallback
(matches "Rs./PKR <number>" in the text) — it has **not** been verified against a real
notification or SMS, unlike `ExpressBackend/utils/bankQr.js`'s QR encoding (which was
reverse-engineered and CRC-checked against real Meezan/JazzCash samples). If it misses real
"payment received" messages, or a message has multiple numbers in it (so it grabs the wrong
one), share 2-3 real texts (redact the sender's name/number if you want) the same way the
QR was worked out, and a tuned parser can be added to that folder, registered in
`Sevices/PaymentNotifications/parsers/index.js` — keyed by Android package name for an app
notification (e.g. `com.techlogix.mobilinkcustomer` for JazzCash, `com.google.android.gm`
for Gmail), or by `sms:<sender>` for a text (e.g. `sms:JazzCash` or `sms:8080`, matching
whatever's typed into **SMS to Monitor** above) — both go through the exact same registry
and fall back to `generic` until a tuned one exists.

## What's NOT included yet

- App icon is a placeholder system icon (`@android:drawable/sym_def_app_icon`), not a
  custom one — purely cosmetic, doesn't affect function.
- No automated tests (this whole app is small enough that manual testing via **Test
  Connection** + watching `ExpressBackend`'s console log when a real notification arrives
  is the practical way to verify it, same as everything else in this repo — see the main
  `plan.md`'s own "no automated test suite" note).
