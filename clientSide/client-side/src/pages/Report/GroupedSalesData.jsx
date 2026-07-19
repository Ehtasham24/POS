import SalesTable from "./SalesTable";

const GroupedSalesData = ({ groupedData }) => {
  return Object.keys(groupedData).map((categoryId) => {
    const sampleItem = groupedData[categoryId][0];
    return (
      <div
        key={categoryId}
        className="mb-6 bg-white-A700 dark:bg-gray-900 rounded-xl2 shadow-card p-6"
      >
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-3">
          Category:{" "}
          <span className="text-primary-600">{sampleItem.category_name}</span>
        </h2>
        <SalesTable salesData={groupedData[categoryId]} />
      </div>
    );
  });
};

export default GroupedSalesData;
