import React from "react";
import { Printer, Text, Row, Line, Image, Cut, render } from "react-thermal-printer";
import { DEFAULT_RECEIPT_TERMS } from "utils/receiptDefaults";
import { resolveTimezone, formatInTimezone } from "utils/timezone";

// Matches Arabic-script characters (covers Urdu too, since it's written in the same script).
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/;

// ESC/POS thermal printers use fixed 8-bit code pages, not Unicode text shaping — they
// cannot render Arabic/Urdu script, so any such line in the user's receipt terms is
// skipped here (it still prints fine in the HTML/print-dialog fallback, a real browser).
export async function buildReceiptBytes(salesData, totalAmount, company = {}, receiptNo = null, creditApplied = 0) {
  const now = formatInTimezone(new Date(), resolveTimezone(company));
  const termsLines = (company.receipt_terms ?? DEFAULT_RECEIPT_TERMS)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !ARABIC_SCRIPT.test(line));

  const tree = (
    <Printer type="epson" width={48}>
      {company.company_logo && <Image src={company.company_logo} align="center" />}
      <Text align="center" bold size={{ width: 1, height: 1 }}>
        {company.company_name || "Company Name"}
      </Text>
      {company.company_ntn && <Text align="center">NTN: {company.company_ntn}</Text>}
      {company.company_address && <Text align="center">{company.company_address}</Text>}
      {company.company_phone && <Text align="center">{company.company_phone}</Text>}
      <Text align="center" bold>
        RECEIPT
      </Text>
      {receiptNo && <Text>Receipt: {receiptNo}</Text>}
      <Text>{now}</Text>
      <Line />

      {salesData.length === 0 ? (
        <Text align="center">No sale data available</Text>
      ) : (
        salesData.map((sale) => (
          <React.Fragment key={sale.id}>
            <Text bold>{sale.productname}</Text>
            <Row
              left={`${sale.quantity} x ${Number(sale.selling_price).toFixed(2)}`}
              right={`Rs.${(sale.selling_price * sale.quantity).toFixed(2)}`}
            />
          </React.Fragment>
        ))
      )}

      <Line />
      <Row left={<Text bold size={{ width: 2, height: 2 }}>TOTAL</Text>} right={<Text bold size={{ width: 2, height: 2 }}>Rs.{totalAmount.toFixed(2)}</Text>} />
      {creditApplied > 0 && (
        <>
          <Row left="Store Credit Applied" right={`-Rs.${creditApplied.toFixed(2)}`} />
          <Row left="Amount Paid" right={`Rs.${(totalAmount - creditApplied).toFixed(2)}`} />
        </>
      )}
      <Line />

      <Text align="center">Thank you for your purchase!</Text>
      {termsLines.map((line, i) => (
        <Text key={i} align="center">
          {line}
        </Text>
      ))}
      <Cut />
    </Printer>
  );

  return render(tree);
}
