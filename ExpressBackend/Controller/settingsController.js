const { getSettings, updateSetting } = require("../Sevices/settingsService");
const asyncHandler = require("../utils/asyncHandler");

const GetSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  res.send(settings);
});

const UpdateSettings = asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).send({ message: "key and value are required" });
  }
  const updated = await updateSetting(key, value);
  res.send(updated);
});

module.exports = { GetSettings, UpdateSettings };
