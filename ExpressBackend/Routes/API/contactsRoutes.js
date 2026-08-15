const express = require("express");
const routes = express.Router();
const { GetContacts, PostContact, UpdateContact } = require("../../Controller/contactsController");
const requireAuth = require("../../Middleware/requireAuth");
const requireOwner = require("../../Middleware/requireOwner");

// Applied per-route (see usersRoutes.js's comment for why routes.use(...) here would
// have been wrong). Contacts is Owner-only in full.
routes.get("/api/contacts", requireAuth, requireOwner, GetContacts);
routes.post("/api/contacts", requireAuth, requireOwner, PostContact);
routes.put("/api/contacts/:id", requireAuth, requireOwner, UpdateContact);

module.exports = routes;
