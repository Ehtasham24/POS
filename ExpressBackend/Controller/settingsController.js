const { getSettings, updateSetting, DEFAULT_TIMEZONE } = require("../Sevices/settingsService");
const asyncHandler = require("../utils/asyncHandler");

const GetSettings = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  // Computed, not stored — lets the Settings UI show what "Auto" actually resolves to
  // without a separate request, and gives every other page a fallback when settings.timezone
  // itself is unset (see utils/timezone.js's resolveTimezone on the frontend).
  res.send({ ...settings, timezone_default: DEFAULT_TIMEZONE });
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
