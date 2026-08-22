const inputClass =
  "p-2.5 border border-surface-border dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500";

const DateRangeSelector = ({
  startDate,
  endDate,
  filterType,
  paymentMethod,
  onStartDateChange,
  onEndDateChange,
  onFilterChange,
  onPaymentMethodChange,
}) => {
  return (
    <div className="mb-4 flex flex-row md:flex-col flex-wrap items-end md:items-stretch gap-4 bg-white-A700 dark:bg-gray-900 rounded-xl2 p-4 border border-surface-border dark:border-gray-700">
      <div>
        <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1 text-sm">
          Start Date:
        </label>
        <input
          type="datetime-local"
          value={startDate}
          onChange={onStartDateChange}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1 text-sm">
          End Date:
        </label>
        <input
          type="datetime-local"
          value={endDate}
          onChange={onEndDateChange}
          className={inputClass}
        />
      </div>
      <div>
        <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1 text-sm">
          Filter by:
        </label>
        <select
          value={filterType}
          onChange={onFilterChange}
          className={inputClass}
        >
          <option value="all">All Products</option>
          <option value="profit">Profitable Products</option>
          <option value="loss">Loss-Making Products</option>
        </select>
      </div>
      <div>
        <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1 text-sm">
          Payment Medium:
        </label>
        <select
          value={paymentMethod}
          onChange={onPaymentMethodChange}
          className={inputClass}
        >
          <option value="">All Payment Mediums</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="bank_transfer">Bank Transfer</option>
        </select>
      </div>
    </div>
  );
};

export default DateRangeSelector;
