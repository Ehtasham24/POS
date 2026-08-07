const express = require("express");
require("dotenv").config();
const path = require("path");
const routesProducts = require("./Routes/API/productsRoutes");
const routesCategories = require("./Routes/API/categoriesRoutes");
const routesSales = require("./Routes/API/salesRoutes");
const routesCreditDebit = require("./Routes/API/creditDebitRoutes");
const routesSettings = require("./Routes/API/settingsRoutes");
const routesSearch = require("./Routes/API/searchRoutes");
const routesInventory = require("./Routes/API/inventoryRoutes");
const routesContacts = require("./Routes/API/contactsRoutes");
const routesPayment = require("./Routes/API/ThirdParty/PayFast/payFastRoutes");
const cors = require("cors");

const server = express();
const Port = 4000;

const Server = async () => {
  const corsOptions = {
    origin: "http://localhost:3000", // Update this for production as needed
  };

  server.use(cors(corsOptions));

  // Middleware to parse URL-encoded bodies
  server.use(express.urlencoded({ extended: true }));
  server.use(express.json());

  // Use routes
  server.use(routesPayment);
  server.use(routesProducts);
  server.use(routesCategories);
  server.use(routesSales);
  server.use(routesCreditDebit);
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
    res.sendFile(path.join(__dirname, "frontend/build", "index.html"));
  });

  try {
    server.listen(Port, () => console.log(`Server started at Port ${Port}`));
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

Server();
