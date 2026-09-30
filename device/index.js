// Runs the POS device runtime from the command line (see runtime.js).
//
//   node index.js     (POS_DATA_DIR, POS_PORT and POS_DEV_SHOP override the defaults)
const path = require("path");
const { startDevice } = require("./runtime");

startDevice({
  dataDir: process.env.POS_DATA_DIR || path.join(__dirname, "data"),
  port: Number(process.env.POS_PORT) || 4100,
  devShop: process.env.POS_DEV_SHOP,
})
  .then(({ close }) => {
    const shutdown = async () => {
      await close().catch(() => {});
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  })
  .catch((err) => {
    console.error("Device start failed:", err);
    process.exit(1);
  });
