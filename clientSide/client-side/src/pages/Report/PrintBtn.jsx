const PrintButton = ({ handlePrint }) => {
  return (
    <div className="mb-4">
      <button
        onClick={handlePrint}
        className="bg-white-A700 text-primary-600 border border-primary-600 font-semibold py-2.5 px-5 rounded-lg hover:bg-primary-50 transition-colors focus:outline-none focus:ring-4 focus:ring-primary-300"
      >
        Print Sales Data
      </button>
    </div>
  );
};

export default PrintButton;
