const { getSettings, updateSetting } = require("../Sevices/settingsService");

const GetSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.send(settings);
  } catch (err) {
    console.log(err);
    res.status(500).send({ message: "Controller error" });
  }
};

const UpdateSettings = async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).send({ message: "key and value are required" });
  }
  try {
    const updated = await updateSetting(key, value);
    res.send(updated);
  } catch (err) {
    console.log(err);
    res.status(500).send({ message: "Controller error" });
  }
};

module.exports = { GetSettings, UpdateSettings };
