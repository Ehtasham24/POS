// Banks/accounts a shop owner in Pakistan is realistically likely to receive a bank
// transfer into — verified against the State Bank of Pakistan's published scheduled-bank,
// microfinance-bank, digital-bank, and EMI lists (Aug 2026), not the full 30+ entry SBP
// register (which includes foreign banks, development banks like ZTBL, and EMIs still in
// pilot/in-principle-approval status that a small shop would never actually bank with).
// Grouped for a <select><optgroup> on the Company page (pages/Company/index.jsx) — an
// "Other" option there always stays available for anything not listed here, since this
// list will inevitably drift out of date as Pakistan's banking sector keeps changing
// (mergers, rebrands, new digital-bank licenses).
export const PAKISTAN_BANKS = [
  {
    group: "Commercial & Islamic Banks",
    banks: [
      "Allied Bank Limited (ABL)",
      "Al Baraka Bank (Pakistan)",
      "Askari Bank",
      "Bank Al Habib",
      "Bank Alfalah",
      "Bank of Khyber",
      "Bank of Punjab",
      "Bank Makramah Limited",
      "BankIslami Pakistan",
      "Dubai Islamic Bank Pakistan",
      "Faysal Bank",
      "Habib Bank Limited (HBL)",
      "Habib Metropolitan Bank",
      "JS Bank",
      "MCB Bank",
      "MCB Islamic Bank",
      "Meezan Bank",
      "National Bank of Pakistan (NBP)",
      "Samba Bank",
      "Silk Bank",
      "Sindh Bank",
      "Soneri Bank",
      "Standard Chartered Bank (Pakistan)",
      "United Bank Limited (UBL)",
    ],
  },
  {
    group: "Microfinance Banks",
    banks: [
      "Advans Pakistan Microfinance Bank",
      "FINCA Microfinance Bank",
      "Khushhali Microfinance Bank",
      "NRSP Microfinance Bank",
      "Pak Oman Microfinance Bank",
      "Sindh Microfinance Bank",
      "The First MicroFinanceBank",
      "U Microfinance Bank (UPaisa)",
    ],
  },
  {
    group: "Digital Banks",
    banks: ["HugoBank", "KT Bank Pakistan", "Mashreq Bank Pakistan", "Raqami Islamic Digital Bank"],
  },
  {
    group: "Digital Wallets / Mobile Accounts",
    banks: ["JazzCash", "Easypaisa", "NayaPay", "SadaPay", "Finja"],
  },
];

export const ALL_PAKISTAN_BANK_NAMES = PAKISTAN_BANKS.flatMap((g) => g.banks);
