// "PKR 12,345" — the one place register/cart/payment amounts are formatted, so a long
// total reads at a glance instead of as an unbroken run of digits. Prices here are whole
// rupees; anything fractional is rounded for display only (the stored value is untouched).
export const formatPKR = (amount) => `PKR ${Math.round(Number(amount) || 0).toLocaleString("en-US")}`;
