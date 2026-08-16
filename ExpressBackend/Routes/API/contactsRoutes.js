const express = require("express");
const routes = express.Router();
const { GetContacts, PostContact, UpdateContact } = require("../../Controller/contactsController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Applied per-route (see usersRoutes.js's comment for why routes.use(...) here would
// have been wrong). Managing contacts (create/edit) stays Owner-only, but reading the list
// is any logged-in staff — ContactSelect.jsx now also renders inside refund-to-store-credit
// (SalesHistory) and checkout store-credit redemption (CartPanel.jsx), both Cashier-
// accessible, so a Cashier needs to be able to pick an existing customer there too.
routes.get("/api/contacts", requireAuth, GetContacts);
routes.post("/api/contacts", requireAuth, requireOwner, PostContact);
routes.put("/api/contacts/:id", requireAuth, requireOwner, UpdateContact);

module.exports = routes;
