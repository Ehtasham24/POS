// Shown on the receipt until the user sets their own terms in Settings — matches what
// was hardcoded before that field existed, so nothing changes for anyone who hasn't
// touched it yet. Shared between the Settings page (as the textarea's starting value)
// and printReceipt.js (as the fallback when no receipt_terms setting is saved at all).
export const DEFAULT_RECEIPT_TERMS =
  "No purchased item will be returned or exchanged.\nخریدا ہوا مال واپسی یہ تبدیل نہیں ہوگا۔";
