import { apiGet } from "utils/api";
import * as printerConnection from "utils/thermalPrinter/connection";
import { buildReceiptBytes } from "utils/thermalPrinter/buildReceiptBytes";
import { DEFAULT_RECEIPT_TERMS } from "utils/receiptDefaults";
import { withFallback, getSettings as getOfflineSettings } from "offline/cache";
import { resolveTimezone, formatInTimezone } from "utils/timezone";

// Escapes text pulled from settings/product names before it's spliced into the
// print-dialog fallback's raw HTML string (that window is built with document.write, not JSX).
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));

function printViaBrowserDialog(salesData, totalAmount, company, receiptNo, creditApplied, existingWindow) {
  const itemRows = salesData.length
    ? salesData
        .map((sale) => {
          const lineTotal = (sale.selling_price * sale.quantity).toFixed(2);
          return `
            <div class="item">
              <div class="item-name">${esc(sale.productname)}</div>
              <div class="item-line">
                <span>${sale.quantity} x ${Number(sale.selling_price).toFixed(2)}</span>
                <span>Rs.${lineTotal}</span>
              </div>
            </div>`;
        })
        .join("")
    : `<p style="text-align:center;">No sale data available</p>`;

  // Consistent-for-everyone business timezone, not this device's own — same reasoning as
  // TimezoneContext.jsx (a printed receipt's time shouldn't depend on which till printed it).
  const now = formatInTimezone(new Date(), resolveTimezone(company));

  const receiptContent = `
  <html>
    <head>
      <title>Receipt</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Courier New', Courier, monospace;
          width: 80mm;
          margin: 0;
          padding: 3mm;
          font-size: 12px;
          color: #000;
        }
        .center { text-align: center; }
        .logo { max-width: 45mm; max-height: 20mm; margin: 0 auto 2mm; display: block; }
        .company-name { font-size: 16px; font-weight: bold; margin: 0 0 1mm; }
        .company-meta { font-size: 11px; line-height: 1.4; }
        .receipt-title { font-size: 13px; font-weight: bold; margin: 2mm 0; }
        .divider { border-top: 1px dashed #000; margin: 2mm 0; }
        .item { margin-bottom: 1.5mm; }
        .item-name { font-weight: bold; }
        .item-line, .total-line, .meta-line {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .total-line { font-size: 14px; font-weight: bold; margin-top: 1mm; }
        .thank-you { text-align: center; margin-top: 3mm; font-size: 12px; }
        .no-return { text-align: center; margin-top: 2mm; font-size: 10px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="center">
        ${company.company_logo ? `<img class="logo" src="${company.company_logo}" alt="" />` : ""}
        <div class="company-name">${esc(company.company_name || "Company Name")}</div>
        <div class="company-meta">
          ${company.company_ntn ? `<div>NTN: ${esc(company.company_ntn)}</div>` : ""}
          ${company.company_address ? `<div>${esc(company.company_address)}</div>` : ""}
          ${company.company_phone ? `<div>${esc(company.company_phone)}</div>` : ""}
        </div>
        <div class="receipt-title">RECEIPT</div>
      </div>

      ${receiptNo ? `<div class="meta-line"><span>Receipt: ${esc(receiptNo)}</span></div>` : ""}
      <div class="meta-line"><span>${esc(now)}</span></div>
      <div class="divider"></div>

      ${itemRows}

      <div class="divider"></div>
      <div class="total-line"><span>TOTAL</span><span>Rs.${totalAmount.toFixed(2)}</span></div>
      ${
        creditApplied > 0
          ? `<div class="meta-line"><span>Store Credit Applied</span><span>-Rs.${creditApplied.toFixed(2)}</span></div>
             <div class="meta-line"><span>Amount Paid</span><span>Rs.${(totalAmount - creditApplied).toFixed(2)}</span></div>`
          : ""
      }
      <div class="divider"></div>

      <p class="thank-you">Thank you for your purchase!</p>
      ${(company.receipt_terms ?? DEFAULT_RECEIPT_TERMS)
        .split("\n")
        .map((line) => (line.trim() ? `<p class="no-return">${esc(line)}</p>` : ""))
        .join("")}
    </body>
  </html>
  `;

  const receiptWindow = existingWindow || window.open("", "_blank", "width=400,height=600");
  if (receiptWindow) {
    receiptWindow.document.write(receiptContent);
    receiptWindow.document.close();
    receiptWindow.print();
    receiptWindow.close();
  }
}

// Prints directly to a connected Bluetooth/USB thermal printer when one is paired
// (see utils/thermalPrinter/connection.js — Chromium-only, best-effort per printer model).
// Falls back to the OS print dialog everywhere else: no printer connected, unsupported
// browser (Safari/iOS/Firefox), or the direct write itself fails mid-print.
export async function printReceipt(salesData, totalAmount, receiptNo, creditApplied = 0, { onFallback } = {}) {
  const printerConnected = !!printerConnection.getStatus().type;
  // Pre-open the receipt window synchronously, before any `await` below, when we're
  // going to need one — most browsers only allow window.open() to escape popup-blocking
  // within the same synchronous continuation as the user gesture that triggered this
  // call (a click), and everything from here down is async (fetching settings, checking
  // out). Called right after checkout completes rather than from a plain onClick, this
  // is a real risk, not a theoretical one — confirmed blocked in a headless-Chrome dry
  // run before adding this.
  const receiptWindow = printerConnected ? null : window.open("", "_blank", "width=400,height=600");

  let company = {};
  try {
    company = await withFallback(() => apiGet("/api/settings"), getOfflineSettings);
  } catch (error) {
    console.error("Error fetching company settings for receipt:", error);
  }

  if (printerConnected) {
    try {
      const bytes = await buildReceiptBytes(salesData, totalAmount, company, receiptNo, creditApplied);
      await printerConnection.write(bytes);
      return;
    } catch (error) {
      console.warn("Direct thermal print failed, falling back to print dialog:", error);
      onFallback?.("Direct print failed — opening print dialog instead.");
      // No pre-opened window for this path (we didn't expect to need one) — same
      // popup-blocking exposure this fallback already had before this change, not a
      // regression, just not newly fixed either.
      printViaBrowserDialog(salesData, totalAmount, company, receiptNo, creditApplied);
      return;
    }
  }

  printViaBrowserDialog(salesData, totalAmount, company, receiptNo, creditApplied, receiptWindow);
}

// Lets the Company page's "Test Print" button confirm a newly-paired printer actually
// works, without needing a real sale on hand.
export async function printTestReceipt() {
  const dummy = [
    { id: "test", productname: "Test Item", selling_price: 100, quantity: 1 },
  ];
  await printReceipt(dummy, 100, "RCPT-000000");
}

// A refund slip is its own document, not a reprint of the original sale receipt — different
// content (one line item, refund method/condition/reason, its own REF-... number referencing
// the original RCPT-... one), so it gets its own small template rather than reusing
// printViaBrowserDialog's cart-of-items layout. Browser print dialog only for v1 (no direct
// thermal path) — a deliberate scope reduction, not an oversight; can gain one later the same
// way printReceipt did, by adding a buildRefundReceiptBytes alongside buildReceiptBytes.
export async function printRefundReceipt({ productname, quantity, amount, refundMethod, condition, reason, refundNo, receiptNo, storeCreditBalance }) {
  const refundWindow = window.open("", "_blank", "width=400,height=600");

  let company = {};
  try {
    company = await withFallback(() => apiGet("/api/settings"), getOfflineSettings);
  } catch (error) {
    console.error("Error fetching company settings for refund receipt:", error);
  }

  const now = formatInTimezone(new Date(), resolveTimezone(company));
  const methodLabel = { cash: "Cash", card: "Card", store_credit: "Store Credit" }[refundMethod] || refundMethod;

  const content = `
  <html>
    <head>
      <title>Refund Slip</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; width: 80mm; margin: 0; padding: 3mm; font-size: 12px; color: #000; }
        .center { text-align: center; }
        .logo { max-width: 45mm; max-height: 20mm; margin: 0 auto 2mm; display: block; }
        .company-name { font-size: 16px; font-weight: bold; margin: 0 0 1mm; }
        .company-meta { font-size: 11px; line-height: 1.4; }
        .receipt-title { font-size: 13px; font-weight: bold; margin: 2mm 0; }
        .divider { border-top: 1px dashed #000; margin: 2mm 0; }
        .meta-line, .total-line { display: flex; justify-content: space-between; gap: 8px; }
        .total-line { font-size: 14px; font-weight: bold; margin-top: 1mm; }
        .item-name { font-weight: bold; margin-bottom: 1.5mm; }
      </style>
    </head>
    <body>
      <div class="center">
        ${company.company_logo ? `<img class="logo" src="${company.company_logo}" alt="" />` : ""}
        <div class="company-name">${esc(company.company_name || "Company Name")}</div>
        <div class="receipt-title">REFUND SLIP</div>
      </div>

      <div class="meta-line"><span>Refund: ${esc(refundNo)}</span></div>
      ${receiptNo ? `<div class="meta-line"><span>Original: ${esc(receiptNo)}</span></div>` : ""}
      <div class="meta-line"><span>${esc(now)}</span></div>
      <div class="divider"></div>

      <div class="item-name">${esc(productname)}</div>
      <div class="meta-line"><span>Qty refunded</span><span>${esc(quantity)}</span></div>
      <div class="meta-line"><span>Condition</span><span>${esc(condition === "damaged" ? "Damaged" : "Resellable")}</span></div>
      <div class="meta-line"><span>Method</span><span>${esc(methodLabel)}</span></div>
      <div class="meta-line"><span>Reason</span><span>${esc(reason)}</span></div>

      <div class="divider"></div>
      <div class="total-line"><span>REFUNDED</span><span>Rs.${Number(amount).toFixed(2)}</span></div>
      ${
        refundMethod === "store_credit" && storeCreditBalance != null
          ? `<div class="meta-line"><span>New credit balance</span><span>Rs.${Number(storeCreditBalance).toFixed(2)}</span></div>`
          : ""
      }
      <div class="divider"></div>
    </body>
  </html>
  `;

  if (refundWindow) {
    refundWindow.document.write(content);
    refundWindow.document.close();
    refundWindow.print();
    refundWindow.close();
  }
}
