import { HiOutlinePrinter } from "react-icons/hi2";

const PrintButton = ({ handlePrint }) => {
  return (
    <div className="mb-4">
      <button
        onClick={handlePrint}
        className="inline-flex items-center gap-2 bg-white-A700 dark:bg-gray-900 text-primary-600 dark:text-primary-400 border border-primary-600 dark:border-primary-500 font-semibold py-2.5 px-5 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors focus:outline-none focus:ring-4 focus:ring-primary-300"
      >
        <HiOutlinePrinter className="text-lg" />
        Print Sales Data
      </button>
    </div>
  );
};

export default PrintButton;
