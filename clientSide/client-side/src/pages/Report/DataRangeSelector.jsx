import { useLanguage } from "i18n/LanguageContext";
import { chipClass } from "./ReportCard";

const inputClass =
  "p-2.5 border border-surface-border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500";

const pad = (n) => String(n).padStart(2, "0");
// Local "YYYY-MM-DDTHH:mm" — the format <input type="datetime-local"> uses.
const formatLocal = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0);
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);

// Each returns [start, end] for "now".
const PRESETS = [
  ["presetToday", (now) => [startOfDay(now), endOfDay(now)]],
  [
    "presetYesterday",
    (now) => {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return [startOfDay(y), endOfDay(y)];
    },
  ],
  ["presetLast7", (now) => [startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)), endOfDay(now)]],
  ["presetThisMonth", (now) => [new Date(now.getFullYear(), now.getMonth(), 1, 0, 0), endOfDay(now)]],
  [
    "presetLastMonth",
    (now) => [new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0), endOfDay(new Date(now.getFullYear(), now.getMonth(), 0))],
  ],
];

const DateRangeSelector = ({
  startDate,
  endDate,
  paymentMethod,
  onStartDateChange,
  onEndDateChange,
  onRangeChange,
  onPaymentMethodChange,
}) => {
  const { t } = useLanguage();
  const now = new Date();

  return (
    <div className="mb-4 rounded-xl2 border border-surface-border bg-white-A700 p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map(([key, range]) => {
          const [start, end] = range(now).map(formatLocal);
          const active = start === startDate && end === endDate;
          return (
            <button key={key} type="button" onClick={() => onRangeChange(start, end)} className={chipClass(active)}>
              {t(`report.${key}`)}
            </button>
          );
        })}
      </div>
      <div className="flex flex-row flex-wrap items-end gap-4 md:flex-col md:items-stretch">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Start Date:</label>
          <input type="datetime-local" value={startDate} onChange={onStartDateChange} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">End Date:</label>
          <input type="datetime-local" value={endDate} onChange={onEndDateChange} className={inputClass} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t("report.paymentMedium")}:</label>
          <select value={paymentMethod} onChange={onPaymentMethodChange} className={inputClass}>
            <option value="">{t("report.allPaymentMediums")}</option>
            <option value="cash">Cash</option>
            <option value="card">Card</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default DateRangeSelector;
