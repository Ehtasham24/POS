const QRCode = require("qrcode");

// Real Raast Personal (P2P) dynamic-QR payload — reverse-engineered and CRC-verified
// against an actual QR generated from a Meezan Bank account (2026-08-18): decoded the raw
// scanned text, walked it as a flat Tag(2)+Length(2 decimal)+Value TLV structure, and
// confirmed the CRC-16/CCITT-FALSE checksum matches exactly, so every field below is
// verified correct, not guessed. Raast is Pakistan's SBP-mandated NATIONAL interoperable
// QR standard — any bank/wallet's Raast-aware "Scan to Pay" should read this regardless of
// which bank issued it, same as the real sample this was built from.
//
// This is deliberately the PERSONAL/P2P shape (tag 02 = "00", exactly as observed), not a
// registered-merchant (P2M) QR — P2M requires formal merchant onboarding through the
// receiving bank (confirmed: e.g. Bank Alfalah's Alfa Business app — "not every account
// holder can generate their own [merchant] QR code"), which is a business decision outside
// what this app can do on its own. This still settles directly into the configured IBAN.
//
// Confirmed field meanings (see the sample this was decoded from):
//   00 = Payload Format Indicator — "02" for Raast's domestic payload version
//   01 = Point of Initiation Method — "11" static / "12" dynamic (this app always dynamic)
//   02 = Type flag — "00" observed for a personal/P2P transfer; not independently confirmed
//        beyond reproducing a real working QR with this exact value
//   04 = Beneficiary IBAN (24-char Pakistani IBAN)
//   05 = Amount — plain decimal string, PKR whole units, no currency symbol/decimal point
//   07 = Expiry — DDMMYYYYHHmm (12 digits)
//   10 = CRC-16/CCITT-FALSE of everything up to and including this field's own "1004" tag+
//        length prefix (NOT including the 4 hex digits being computed), 4 uppercase hex digits
const RAAST_PAYLOAD_FORMAT = "02";
const RAAST_DYNAMIC_INDICATOR = "12";
const RAAST_TYPE_PERSONAL = "00";
// How long a generated QR stays payable — mirrors the 7-day-out default observed on the
// real sample this was reverse-engineered from (generated same-day, expiry 7 days later at
// 23:59). Independent of — and deliberately more generous than — how long this app's own
// bank_payment_intents row stays "awaiting_payment" (which never auto-expires at all, see
// plan.md); this is purely what keeps the QR itself valid/scannable on Raast's own network.
const QR_VALIDITY_DAYS = 7;

const tlv = (tag, value) => `${tag}${String(value.length).padStart(2, "0")}${value}`;

// CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no input/output reflection, no final XOR —
// the exact parameters that reproduced the verified sample's checksum.
const crc16CcittFalse = (str) => {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

const formatExpiry = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    pad(date.getDate()) +
    pad(date.getMonth() + 1) +
    date.getFullYear() +
    "2359" // end-of-day, matching the observed sample's HHmm
  );
};

// `bankDetails.iban` is required — this format has no plain-account-number field, only
// tag 04's IBAN (see bankPaymentService.js's validation, which rejects intent creation if
// bank_iban isn't configured). `bankName`/`accountTitle`/`accountNumber` aren't encoded in
// the QR itself at all (confirmed absent from the verified sample — a Raast-aware app looks
// the beneficiary name up from the IBAN via Raast's own directory, not from the QR), but are
// still shown on the checkout screen next to the QR (BankTransferQrModal.jsx) so the cashier/
// customer has a human-readable confirmation of which account it's going to.
const buildQrPayload = ({ iban }, amount) => {
  const expiry = formatExpiry(
    new Date(Date.now() + QR_VALIDITY_DAYS * 24 * 60 * 60 * 1000)
  );

  const withoutCrc =
    tlv("00", RAAST_PAYLOAD_FORMAT) +
    tlv("01", RAAST_DYNAMIC_INDICATOR) +
    tlv("02", RAAST_TYPE_PERSONAL) +
    tlv("04", iban) +
    tlv("05", String(Math.round(Number(amount)))) +
    tlv("07", expiry) +
    "1004"; // tag+length of the CRC field itself, included in what gets checksummed

  return withoutCrc + crc16CcittFalse(withoutCrc);
};

// PNG data URI — same "just an <img src>" shape the app already uses for the company
// logo (printReceipt.js/ReceiptPreviewModal.jsx), so the frontend needs no new image-
// handling code, just a new source string.
const generateQrDataUrl = (payload) => QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 1 });

module.exports = { buildQrPayload, generateQrDataUrl };
