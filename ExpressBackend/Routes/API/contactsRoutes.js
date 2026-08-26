const express = require("express");
const routes = express.Router();
const { GetContacts, PostContact, UpdateContact } = require("../../Controller/contactsController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");
const requireFeature = require("../../Middleware/requireFeature");

// Applied per-route (see usersRoutes.js's comment for why routes.use(...) here would
// have been wrong). Managing contacts (create/edit) stays Owner-only, but reading the list
// is any logged-in staff — ContactSelect.jsx now also renders inside refund-to-store-credit
// (SalesHistory) and checkout store-credit redemption (CartPanel.jsx), both Cashier-
// accessible, so a Cashier needs to be able to pick an existing customer there too.
// Contacts as a whole is Smart-tier+.
routes.get("/api/contacts", requireAuth, requireFeature("contacts"), GetContacts);
routes.post("/api/contacts", requireAuth, requireOwner, requireFeature("contacts"), PostContact);
routes.put("/api/contacts/:id", requireAuth, requireOwner, requireFeature("contacts"), UpdateContact);

module.exports = routes;
