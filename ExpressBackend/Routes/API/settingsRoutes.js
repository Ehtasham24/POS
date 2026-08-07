const express = require("express");
const routes = express.Router();
const { GetSettings, UpdateSettings } = require("../../Controller/settingsController");

routes.get("/api/settings", GetSettings);
routes.put("/api/settings", UpdateSettings);

module.exports = routes;
