const generic = require("./generic");

// Keyed by Android package name (e.g. "com.techlogix.mobilinkcustomer" for JazzCash) —
// the phone-side forwarder app sends the source package with every notification, so a
// per-bank/wallet parser can be looked up directly without guessing which app a
// notification came from. Falls back to `generic` for any package with no tuned parser
// registered yet, per generic.js's own comment on how to add one.
const registry = new Map();

const registerParser = (packageName, parser) => registry.set(packageName, parser);

const getParser = (packageName) => registry.get(packageName) || generic;

const listParsers = () => [
  { packageName: "*", ...generic },
  ...[...registry.entries()].map(([packageName, parser]) => ({ packageName, ...parser })),
];

module.exports = { registerParser, getParser, listParsers };
