import { useEffect, useState } from "react";

const DEFAULT_INPUT_CLASS =
  "bg-white-A700 dark:bg-gray-900 border border-surface-border dark:border-gray-700 mt-2 text-gray-900 dark:text-gray-100 text-sm rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 block w-full p-2.5";
const DEFAULT_LABEL_CLASS = "block mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100";

const round2 = (n) => Math.round(n * 100) / 100;

// Lets a buying price be entered either directly per unit, or as a bulk total that gets
// divided by the (already-entered) quantity — "I paid Rs. 3000 for 50 units" becomes
// Rs. 60/unit. Purely a client-side input convenience: whichever mode is used, the same
// per-unit number is reported up via onPriceChange, so the parent form — and everything it
// eventually submits to the backend — never needs to know which mode produced it.
export default function PriceEntryField({
  idPrefix,
  quantity,
  price,
  onPriceChange,
  label = "Buying Price",
  inputClassName = DEFAULT_INPUT_CLASS,
  labelClassName = DEFAULT_LABEL_CLASS,
  required = true,
}) {
  const [mode, setMode] = useState("perItem");
  const [bulkTotal, setBulkTotal] = useState("");

  const qtyNum = Number(quantity);
  const totalNum = Number(bulkTotal);
  const hasValidQty = Number.isFinite(qtyNum) && qtyNum > 0;
  const hasValidTotal = bulkTotal !== "" && Number.isFinite(totalNum) && totalNum > 0;
  const computedPerUnit = hasValidQty && hasValidTotal ? round2(totalNum / qtyNum) : null;

  // Keep the parent's price in sync with the bulk math while in bulk mode — including
  // clearing it back to "" if quantity gets blanked/invalidated after a total was already
  // entered, so a stale computed price can never linger and slip through on submit.
  useEffect(() => {
    if (mode !== "bulk") return;
    onPriceChange(computedPerUnit !== null ? String(computedPerUnit) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, computedPerUnit]);

  const switchToBulk = () => {
    // Pre-fill an equivalent total from whatever per-unit price/quantity are already
    // entered, so toggling the mode doesn't lose/blank a value the user already typed.
    if (Number.isFinite(Number(price)) && Number(price) > 0 && hasValidQty) {
      setBulkTotal(String(round2(Number(price) * qtyNum)));
    }
    setMode("bulk");
  };

  const toggleBtnClass = (active) =>
    `rounded-md px-2.5 py-1 transition-colors ${
      active
        ? "bg-primary-600 text-white-A700"
        : "text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
    }`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`${idPrefix}_price`} className={`${labelClassName} mb-0`}>
          {label}
        </label>
        <div className="flex gap-1 rounded-lg bg-surface-subtle p-1 text-xs font-semibold dark:bg-gray-800">
          <button type="button" onClick={() => setMode("perItem")} className={toggleBtnClass(mode === "perItem")}>
            Per item
          </button>
          <button type="button" onClick={switchToBulk} className={toggleBtnClass(mode === "bulk")}>
            Bulk purchase
          </button>
        </div>
      </div>

      {mode === "perItem" ? (
        <input
          type="number"
          id={`${idPrefix}_price`}
          value={price}
          onChange={(e) => onPriceChange(e.target.value)}
          placeholder="Enter buying price"
          className={inputClassName}
          min="0"
          step="0.01"
          required={required}
        />
      ) : (
        <>
          <input
            type="number"
            id={`${idPrefix}_price`}
            value={bulkTotal}
            onChange={(e) => setBulkTotal(e.target.value)}
            placeholder="Total amount paid"
            className={inputClassName}
            min="0"
            step="0.01"
            required={required}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {computedPerUnit !== null
              ? `≈ Rs.${computedPerUnit.toFixed(2)} / unit`
              : hasValidQty
              ? "Enter the total amount paid for this quantity."
              : "Enter a quantity above first."}
          </p>
        </>
      )}
    </div>
  );
}
