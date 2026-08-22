import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiOutlineQrCode } from "react-icons/hi2";
import { apiGet } from "utils/api";
import { useLanguage } from "i18n/LanguageContext";

const POLL_MS = 60000;

// Global "bank transfers waiting on payment" indicator, mirroring LowStockBell.jsx's shape
// exactly (same poll-on-an-interval-since-a-page-can-stay-open-a-long-time reasoning).
// Visible to any logged-in staff, not Owner-only — matches confirm/cancel's own access
// level (Routes/API/bankPaymentRoutes.js), since whoever's on shift is trusted to resolve
// these, same as refunds already work.
export default function PendingBankPaymentsBell() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [count, setCount] = useState(0);

  const fetchCount = async () => {
    try {
      const intents = await apiGet("/api/bank-payments/intents?status=awaiting_payment");
      setCount(intents.length);
    } catch (error) {
      console.error("Error fetching pending bank payments:", error);
    }
  };

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  if (count === 0) {
    return (
      <button
        type="button"
        onClick={() => navigate("/payment-mediums")}
        aria-label={t("paymentMediums.title")}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <HiOutlineQrCode className="text-xl" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => navigate("/payment-mediums")}
      aria-label={t("paymentMediums.title")}
      className="relative flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 hover:bg-surface-muted dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <HiOutlineQrCode className="text-xl" />
      <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1 text-[11px] font-bold text-white-A700 ring-2 ring-white-A700 dark:ring-gray-900">
        {count}
      </span>
    </button>
  );
}
