// The single source of truth for which tier unlocks which feature. Nothing outside this
// file should ever compare a tier string directly (no "if (tier === 'advanced')" anywhere
// else) — every gate, backend or frontend, goes through hasFeature() below.
const TIER_RANK = { basic: 1, smart: 2, advanced: 3 };

const FEATURES = {
  // minTier: this tier and every tier above it gets the feature.
  multiUser: { minTier: "smart" },
  voidRefund: { minTier: "smart" },
  contacts: { minTier: "smart" },
  partyLedger: { minTier: "smart" },
  storeCredit: { minTier: "smart" },
  bankTransfer: { minTier: "smart" },
  lotTracking: { minTier: "smart" },
  stockAdjustments: { minTier: "smart" },
  salesCharts: { minTier: "smart" },

  shifts: { minTier: "advanced" },
  shrinkageReport: { minTier: "advanced" },

  // onlyTier: this tier ONLY — locked on every tier above it too. A plain minTier/rank
  // model can't express "basic and nothing else," which is exactly what this one needs:
  // manual quantity editing is deliberately locked back OUT once Stock Adjustments (Smart+)
  // gives a shop an audited way to change quantity instead.
  manualQuantityEdit: { onlyTier: "basic" },
};

const hasFeature = (tier, key) => {
  const rule = FEATURES[key];
  if (!rule) throw new Error(`Unknown feature: "${key}"`);
  if (rule.onlyTier) return tier === rule.onlyTier;
  return TIER_RANK[tier] >= TIER_RANK[rule.minTier];
};

// Every feature key unlocked at this tier — what /api/auth/me sends the frontend so it
// never has to know the registry's own rules, just the resulting list.
const getFeaturesForTier = (tier) => Object.keys(FEATURES).filter((key) => hasFeature(tier, key));

module.exports = { TIER_RANK, FEATURES, hasFeature, getFeaturesForTier };
