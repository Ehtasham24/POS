import { HiOutlineBackspace } from "react-icons/hi2";

// Touch-first number pad for the register (prices, cash received) — a phone/tablet
// keyboard popping up and covering half the till is slower than a fixed pad in place.
// Controlled: works on the same string value an <input> next to it edits, so typing on a
// physical keyboard and tapping here stay in sync. Whole numbers only (rupees).
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0", "back"];
const MAX_DIGITS = 9;

export default function Numpad({ value, onChange, className = "" }) {
  const press = (key) => {
    const current = String(value ?? "");
    if (key === "back") return onChange(current.slice(0, -1));
    const next = (current === "0" ? "" : current) + key;
    if (next.replace(/^0+/, "").length > MAX_DIGITS) return;
    onChange(next.replace(/^0+(?=\d)/, ""));
  };

  return (
    <div className={`grid grid-cols-3 gap-2 ${className}`}>
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          // Don't steal focus from the input — a physical keyboard should keep working
          // after a tap.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => press(key)}
          aria-label={key === "back" ? "Backspace" : key}
          className="flex h-12 items-center justify-center rounded-xl bg-surface-muted font-poppins text-lg font-semibold text-gray-800 transition-colors hover:bg-surface-border active:scale-95 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
        >
          {key === "back" ? <HiOutlineBackspace className="text-xl" /> : key}
        </button>
      ))}
    </div>
  );
}
