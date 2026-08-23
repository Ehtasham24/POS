const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");
const cookieParser = require("cookie-parser");
require("dotenv").config({ path: path.join(__dirname, "Development.env") });
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
const errorHandler = require("./Middleware/errorHandler");
const { startShiftAutoCloseSweep } = require("./Sevices/shiftSweep");
const cors = require("cors");

const server = express();
const Port = process.env.PORT || 4000;

const Server = async () => {
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
  // workflow (CRA dev server + this API) needs.
  const certPath = path.join(__dirname, "certs/lan-cert.pem");
  const keyPath = path.join(__dirname, "certs/lan-key.pem");
  const useHttps = fs.existsSync(certPath) && fs.existsSync(keyPath);

  try {
    if (useHttps) {
      https
        .createServer(
          { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) },
          server
        )
        .listen(Port, () => console.log(`HTTPS server started at Port ${Port}`));
    } else {
      server.listen(Port, () => console.log(`Server started at Port ${Port}`));
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
  const webhookApp = express();
  webhookApp.use(express.json());
  webhookApp.use(routesPaymentNotifications);
  const webhookPort = process.env.WEBHOOK_PORT || 4001;
  http
    .createServer(webhookApp)
    .listen(webhookPort, () => console.log(`Phone-forwarder webhook listening on port ${webhookPort}`));

  // Auto-closes an abandoned shift (crashed app, closed tab, forgotten to close) after 15
  // minutes of no activity — see Sevices/shiftSweep.js and migrations/019.
  startShiftAutoCloseSweep();
};

Server();
