const express = require("express");
const path = require("path");
const fs = require("fs");
const https = require("https");
require("dotenv").config({ path: path.join(__dirname, "Development.env") });
const routesProducts = require("./Routes/API/productsRoutes");
const routesCategories = require("./Routes/API/categoriesRoutes");
const routesSales = require("./Routes/API/salesRoutes");
const routesPartyLedger = require("./Routes/API/partyLedgerRoutes");
const routesSettings = require("./Routes/API/settingsRoutes");
const routesSearch = require("./Routes/API/searchRoutes");
const routesInventory = require("./Routes/API/inventoryRoutes");
const routesContacts = require("./Routes/API/contactsRoutes");
const routesPayment = require("./Routes/API/ThirdParty/PayFast/payFastRoutes");
const errorHandler = require("./Middleware/errorHandler");
const cors = require("cors");

const server = express();
const Port = process.env.PORT || 4000;

const Server = async () => {
  const corsOptions = {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000", // Update this for production as needed
  };

  server.use(cors(corsOptions));

  // Middleware to parse URL-encoded bodies
  server.use(express.urlencoded({ extended: true }));
  // Raised from the default 100kb so a base64-encoded company logo (stored as a
  // settings value) fits comfortably through the generic /api/settings endpoint.
  server.use(express.json({ limit: "2mb" }));

  // Use routes
  server.use(routesPayment);
  server.use(routesProducts);
  server.use(routesCategories);
  server.use(routesSales);
  server.use(routesPartyLedger);
  server.use(routesSettings);
  server.use(routesSearch);
  server.use(routesInventory);
  server.use(routesContacts);

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
};

Server();
