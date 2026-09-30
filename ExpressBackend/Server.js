const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const cookieParser = require("cookie-parser");
require("./loadEnv");
const routesProducts = require("./Routes/API/productsRoutes");
const routesCategories = require("./Routes/API/categoriesRoutes");
const routesSales = require("./Routes/API/salesRoutes");
const routesPartyLedger = require("./Routes/API/partyLedgerRoutes");
const routesStoreCredit = require("./Routes/API/storeCreditRoutes");
const routesSettings = require("./Routes/API/settingsRoutes");
const routesSearch = require("./Routes/API/searchRoutes");
const routesInventory = require("./Routes/API/inventoryRoutes");
const routesContacts = require("./Routes/API/contactsRoutes");
const routesBankPayment = require("./Routes/API/bankPaymentRoutes");
const routesPaymentNotifications = require("./Routes/API/paymentNotificationRoutes");
const routesPaymentGateway = require("./Routes/API/paymentGatewayRoutes");
const routesShifts = require("./Routes/API/shiftRoutes");
const routesStockAdjustments = require("./Routes/API/stockAdjustmentRoutes");
const routesPayment = require("./Routes/API/ThirdParty/PayFast/payFastRoutes");
const routesAuth = require("./Routes/API/authRoutes");
const routesUsers = require("./Routes/API/usersRoutes");
const routesHealth = require("./Routes/API/healthRoutes");
const routesAdmin = require("./Routes/API/adminRoutes");
const routesShopStatus = require("./Routes/API/shopStatusRoutes");
const errorHandler = require("./Middleware/errorHandler");
const { startShiftAutoCloseSweep } = require("./Sevices/shiftSweep");
const { recordEgress } = require("./Sevices/egressService");
const monitoring = require("./Sevices/monitoringService");
const { invalidate } = require("./utils/cache");
const { inventoryCacheKey } = require("./Sevices/inventoryService");
const { startMaintenanceSweep } = require("./Sevices/maintenanceSweep");
const cors = require("cors");

const server = express();
const Port = process.env.PORT || 4000;
// On a shop's own device (../device/) the app and its API are for that machine only: listen on
// loopback, so nobody else on the shop's WiFi can reach them, and skip the cloud-only
// phone-forwarder webhook listener.
const ON_DEVICE = process.env.POS_RUNTIME === "device";
const Host = ON_DEVICE ? "127.0.0.1" : undefined;

const Server = async () => {
  // Behind a reverse proxy (deploy/nginx/pos.conf), TLS ends at the proxy and this app only
  // ever sees plain HTTP from it. Without trusting the proxy's X-Forwarded-Proto/-For,
  // req.secure stays false — and utils/auth.js sets the session cookie with
  // `secure: req.secure` + SameSite=None, which browsers reject unless Secure, so every
  // login would silently fail to stick. req.ip would also be the proxy's own address instead
  // of the client's (PayFast's IP allow-list check relies on it).
  //
  // Opt-in, never a blanket `true`: trusting forwarded headers when NO proxy is in front
  // would let any client spoof its own IP/protocol just by sending those headers itself.
  // TRUST_PROXY takes Express's own value syntax — "loopback" when the proxy runs on this
  // same machine (the usual case), a hop count like "1", or a comma-separated IP list.
  if (process.env.TRUST_PROXY) {
    const value = process.env.TRUST_PROXY;
    server.set("trust proxy", /^\d+$/.test(value) ? Number(value) : value);
  }

  const corsOptions = {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000", // Update this for production as needed
    // Needed for the session cookie to actually round-trip in npm start's dev mode,
    // where the CRA dev server (localhost:3000) and this API (localhost:4000) are a
    // different origin — paired with credentials:"include" on the frontend's fetch
    // calls (utils/api.js). Same-origin in production (Express serves both), where
    // this has no effect either way.
    credentials: true,
  };

  server.use(cors(corsOptions));
  server.use(cookieParser());

  // Middleware to parse URL-encoded bodies
  server.use(express.urlencoded({ extended: true }));
  // Raised from the default 100kb so a base64-encoded company logo (stored as a
  // settings value) fits comfortably through the generic /api/settings endpoint.
  server.use(express.json({ limit: "2mb" }));

  // Egress tracking (migration 024) and the Health page's request metrics
  // (monitoringService.js) — mounted before every route so it wraps the whole request, but
  // it reads req.shop and req.route only inside the 'finish' listener, which fires after the
  // full downstream chain (including whichever route's own requireAuth) has already run and
  // set them. Deliberately fire-and-forget: recordEgress's own promise is never awaited or
  // returned, so a slow/failed egress write can never delay or fail the actual response
  // it's measuring, and .catch here is just so that failure doesn't become an unhandled
  // rejection.
  server.use((req, res, next) => {
    const started = process.hrtime.bigint();
    res.on("finish", () => {
      const shopId = req.shop?.id;
      // API routes only — static files and the SPA fallback ("*") aren't the API's health.
      const route = req.route && req.route.path !== "*" ? `${req.baseUrl}${req.route.path}` : null;
      if (route || (res.statusCode === 404 && req.path.startsWith("/api/"))) {
        monitoring.recordRequest({
          method: req.method,
          route: route || "(no such route)",
          status: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - started) / 1e6,
          shopId,
        });
      }
      if (!shopId) return;
      // Any change a shop makes (a sale, a refund, stock added, a product edited) can move its
      // stock figures — drop its cached inventory summary so the next read is current.
      if (req.method !== "GET" && res.statusCode < 400) {
        invalidate(inventoryCacheKey(shopId)).catch(() => {});
      }
      const bytes = Number(res.getHeader("content-length")) || 0;
      recordEgress(shopId, bytes).catch((err) => console.error("Egress tracking failed:", err));
    });
    next();
  });

  // Use routes. Each protected route applies requireAuth (and, where relevant,
  // requireOwner) as its own per-route middleware argument — not a router-level
  // router.use(requireAuth), which turned out to fire for *any* request reaching that
  // router in the pipeline regardless of path (confirmed live, see e.g. inventoryRoutes.js's
  // comment) — and not a blanket server.use(requireAuth) here either, since that would
  // also catch the static build/SPA catch-all below, which must stay reachable even when
  // logged out (see requireAuth.js's comment for the full reasoning).
  server.use(routesPayment); // third-party webhook, deliberately left public
  server.use(routesPaymentNotifications); // phone-forwarder webhook, gated by shared secret not auth
  server.use(routesPaymentGateway); // JazzCash/Easypaisa: initiate gated by requireAuth per-route, callback verified by gateway signature not auth
  server.use(routesAuth); // public: login/logout; /me itself requires auth per-route
  server.use(routesHealth); // public: connectivity ping target
  server.use(routesUsers);
  server.use(routesProducts);
  server.use(routesCategories);
  server.use(routesSales);
  server.use(routesPartyLedger);
  server.use(routesStoreCredit);
  server.use(routesSettings);
  server.use(routesSearch);
  server.use(routesInventory);
  server.use(routesContacts);
  server.use(routesBankPayment);
  server.use(routesShifts);
  server.use(routesStockAdjustments);
  server.use(routesAdmin); // platform-level (requireSuperAdmin) — no shop context, see adminRoutes.js
  server.use(routesShopStatus);

  // Serve static files from the React app
  server.use(
    express.static(path.join(__dirname, "../clientSide/client-side/build"))
  );

  // The "catchall" handler: for any request that doesn't match one above, send back React's index.html file.
  server.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../clientSide/client-side/build", "index.html"));
  });

  // Centralized error handler — must be registered last so next(err) from any route reaches it.
  server.use(errorHandler);

  // Serves over HTTPS when a local cert is present (see certs/ — generate with mkcert;
  // required for mobile devices on the LAN to install this as a PWA / use camera-gated
  // APIs, since browsers only treat HTTPS — or localhost — as a secure context).
  // Falls back to plain HTTP otherwise, which is all `npm start`'s two-server dev
  // workflow (CRA dev server + this API) needs. APP_HTTPS=false forces plain HTTP even when
  // the certs exist — the setup behind a reverse proxy, which terminates TLS itself with a
  // real certificate (see deploy/nginx/pos.conf).
  const certPath = path.join(__dirname, "certs/lan-cert.pem");
  const keyPath = path.join(__dirname, "certs/lan-key.pem");
  const useHttps = process.env.APP_HTTPS !== "false" && fs.existsSync(certPath) && fs.existsSync(keyPath);

  try {
    if (useHttps) {
      https
        .createServer(
          { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
          server
        )
        .listen(Port, Host, () => console.log(`HTTPS server started at Port ${Port}`));
    } else {
      server.listen(Port, Host, () => console.log(`Server started at Port ${Port}`));
    }
  } catch (err) {
    console.log(err);
    process.exit(1);
  }

  // A second, deliberately separate, PLAIN HTTP listener carrying ONLY the phone-forwarder
  // webhook routes — not the main `server` app, so nothing else (login, session-cookie
  // routes) is ever reachable through it. Exists because the LAN-facing mkcert cert
  // (certs/lan-cert.pem, see above) is issued only for localhost/127.0.0.1/::1 — a phone
  // on the shop WiFi hitting the server's actual LAN IP would fail TLS hostname
  // verification, and getting a phone to trust a custom CA is real setup friction for a
  // DIY/cost-effective use case. These two routes are already gated by
  // requireForwarderSecret (Middleware/requireForwarderSecret.js) rather than the session
  // cookie the HTTPS-only requirement was originally about (see utils/auth.js's
  // SameSite=None+Secure comment) — that reasoning doesn't apply to a shared-secret
  // header, so plain HTTP here is a deliberate, scoped trade-off, not an oversight.
  if (!ON_DEVICE) {
    const webhookApp = express();
    webhookApp.use(express.json());
    // Only the phone's two secret-authenticated routes — not the whole router, whose staff
    // routes (forwarder status, secret management) rely on the session cookie.
    webhookApp.use(routesPaymentNotifications.webhookRoutes);
    // Same JSON error shape as the main app (401/403 from the secret/plan checks).
    webhookApp.use(errorHandler);
    const webhookPort = process.env.WEBHOOK_PORT || 4001;
    http
      .createServer(webhookApp)
      .listen(webhookPort, () => console.log(`Phone-forwarder webhook listening on port ${webhookPort}`));
  }

  // Auto-closes an abandoned shift (crashed app, closed tab, forgotten to close) after 15
  // minutes of no activity — see Sevices/shiftSweep.js and migrations/019.
  startShiftAutoCloseSweep();
  startMaintenanceSweep();
};

Server();
