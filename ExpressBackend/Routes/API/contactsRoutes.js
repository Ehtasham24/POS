const express = require("express");
const routes = express.Router();
const { GetContacts, PostContact, UpdateContact } = require("../../Controller/contactsController");

routes.get("/api/contacts", GetContacts);
routes.post("/api/contacts", PostContact);
routes.put("/api/contacts/:id", UpdateContact);

module.exports = routes;
