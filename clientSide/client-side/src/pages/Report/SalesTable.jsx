const SalesTable = ({ salesData }) => {
  return (
    <div className="w-full overflow-x-auto rounded-xl2 border border-surface-border dark:border-gray-700">
    <table className="min-w-full bg-white-A700 dark:bg-gray-900 overflow-hidden">
      <thead>
        <tr className="bg-surface-subtle dark:bg-gray-800">
          <th className="py-3 px-4 text-left text-sm font-semibold text-gray-800 dark:text-gray-100">
            Product Name
          </th>
          <th className="py-3 px-4 text-left text-sm font-semibold text-gray-800 dark:text-gray-100">
            Buying Price
          </th>
          <th className="py-3 px-4 text-left text-sm font-semibold text-gray-800 dark:text-gray-100">
            Total Quantity Sold
          </th>
          <th className="py-3 px-4 text-left text-sm font-semibold text-gray-800 dark:text-gray-100">
            Avg Selling Price
          </th>
          <th className="py-3 px-4 text-left text-sm font-semibold text-gray-800 dark:text-gray-100">
            Profit/Loss Per Unit
          </th>
          <th className="py-3 px-4 text-left text-sm font-semibold text-gray-800 dark:text-gray-100">
            Overall Profit/Loss
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-surface-border dark:divide-gray-700">
        {salesData.map((item, index) => (
          <tr key={index} className="even:bg-surface-subtle dark:even:bg-gray-800">
            <td className="py-2 px-4 text-gray-800 dark:text-gray-100">{item.productname}</td>
            <td className="py-2 px-4 text-gray-800 dark:text-gray-100">{item.buyingprice}</td>
            <td className="py-2 px-4 text-gray-800 dark:text-gray-100">
              {item.total_quantity_sold}
            </td>
            <td className="py-2 px-4 text-gray-800 dark:text-gray-100">
              {item.avg_selling_price}
            </td>
            <td className="py-2 px-4 text-gray-800 dark:text-gray-100">
              <span>{item.profit_loss}</span>
            </td>
            <td className="py-2 px-4">
              <span
                className={
                  item.overall_profit_loss >= 0
                    ? "text-success-600"
                    : "text-danger-600"
                }
              >
                {item.overall_profit_loss}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
};

export default SalesTable;
